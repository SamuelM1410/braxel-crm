import { timingSafeEqual } from "node:crypto";
import { type Db, EmailDirection, RecordSource, SocialChannel } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	Logger,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";

export const whatsappWebInboundSchema = z.object({
	channel: z.literal("WHATSAPP_WEB_PILOT"),
	externalMessageId: z.string().trim().min(1).max(240),
	externalSenderId: z.string().trim().min(1).max(240),
	phone: z.string().trim().max(80).optional().nullable(),
	name: z.string().trim().max(180).optional().nullable(),
	text: z.string().max(8000),
	receivedAt: z.coerce.date().optional(),
});

export type WhatsAppWebInbound = z.infer<typeof whatsappWebInboundSchema>;

type EveReplyDecision = {
	text: string | null;
	requiresHuman: boolean;
	reason: string;
};

export function normalizePhone(
	value: string | null | undefined,
): string | null {
	if (!value) return null;
	const digits = value.replace(/\D/g, "");
	return digits.length >= 6 ? digits : null;
}

export function bearerMatches(
	authorization: string | undefined,
	secret: string | undefined,
): boolean {
	if (!authorization || !secret) return false;
	const expected = Buffer.from(`Bearer ${secret}`, "utf8");
	const supplied = Buffer.from(authorization, "utf8");
	return (
		expected.length === supplied.length && timingSafeEqual(expected, supplied)
	);
}

function firstNameAndLastName(name: string | null | undefined) {
	const parts = (name ?? "WhatsApp lead").trim().split(/\s+/).filter(Boolean);
	return {
		firstName: parts[0] ?? "WhatsApp lead",
		lastName: parts.slice(1).join(" ") || null,
	};
}

function contactPhoneCandidates(phone: string | null): string[] {
	if (!phone) return [];
	const normalized = normalizePhone(phone);
	return [
		...new Set(
			[phone, normalized, normalized ? `+${normalized}` : null].filter(Boolean),
		),
	] as string[];
}

@Injectable()
export class WhatsAppWebService {
	private readonly logger = new Logger(WhatsAppWebService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: ConfigService<EnvironmentVariables, true>,
		private readonly agent: AgentTriggerService,
	) {}

	assertAuthorization(authorization?: string) {
		const secret = this.webhookSecret();
		if (!bearerMatches(authorization, secret))
			throw new UnauthorizedException("Invalid WhatsApp pilot authorization.");
	}

	health() {
		return {
			ok: true,
			inboundOnly: true,
			autoReplyMode: this.autoReplyMode(),
			webhookConfigured: Boolean(this.webhookSecret()),
		};
	}

	private autoReplyMode(): "disabled" | "smart" {
		return this.config.get("WHATSAPP_AUTO_REPLY_MODE", { infer: true }) ===
			"smart"
			? "smart"
			: "disabled";
	}

	private webhookSecret() {
		return (
			this.config.get("WHATSAPP_WEBHOOK_SECRET", { infer: true }) ??
			this.config.get("CRM_INTAKE_SECRET", { infer: true })
		);
	}

	async ingest(input: unknown) {
		const parsed = whatsappWebInboundSchema.safeParse(input);
		if (!parsed.success) {
			throw new BadRequestException({
				message: "Invalid WhatsApp Web inbound payload.",
				issues: parsed.error.issues.map((issue) => ({
					path: issue.path.join("."),
					message: issue.message,
				})),
			});
		}

		const event = parsed.data;
		const sentAt = event.receivedAt ?? new Date();
		const normalizedPhone = normalizePhone(event.phone);
		const contact = await this.findOrCreateContact(event.name, event.phone);
		const externalThreadId = `web:${event.externalSenderId}`;
		const thread = await this.db.socialThread.upsert({
			where: {
				channel_externalThreadId: {
					channel: SocialChannel.WHATSAPP,
					externalThreadId,
				},
			},
			create: {
				channel: SocialChannel.WHATSAPP,
				externalThreadId,
				externalSenderId: event.externalSenderId,
				externalRecipientId: normalizedPhone,
				contactId: contact?.id,
				firstMessageAt: sentAt,
				lastMessageAt: sentAt,
				messageCount: 0,
			},
			update: {
				lastMessageAt: sentAt,
				contactId: contact?.id ?? undefined,
			},
		});

		const existing = await this.db.socialMessage.findUnique({
			where: {
				threadId_externalMessageId: {
					threadId: thread.id,
					externalMessageId: event.externalMessageId,
				},
			},
			select: { id: true },
		});
		if (existing) {
			return {
				ok: true,
				duplicate: true,
				messageId: existing.id,
				threadId: thread.id,
				approvalRequired: true,
				reviewReason: "Duplicate event was already stored.",
				draft: null,
				reply: null,
			};
		}

		const draft = event.text.trim()
			? await this.draft(event.name, event.text)
			: null;
		const autoReply =
			draft?.text && !draft.requiresHuman && this.autoReplyMode() === "smart"
				? draft.text
				: null;
		const raw = {
			source: event.channel,
			externalMessageId: event.externalMessageId,
			externalSenderId: event.externalSenderId,
			phone: normalizedPhone,
			name: event.name ?? null,
			receivedAt: sentAt.toISOString(),
			approvalStatus: autoReply ? "AUTO_REPLY" : "REVIEW_REQUIRED",
			draft: draft?.text ?? null,
			draftReason: draft?.reason ?? "AI provider is not configured.",
			autoReplyMode: this.autoReplyMode(),
		};

		let created: { id: string } | null = null;
		try {
			created = await this.db.socialMessage.create({
				data: {
					threadId: thread.id,
					externalMessageId: event.externalMessageId,
					direction: EmailDirection.INBOUND,
					senderId: event.externalSenderId,
					body: event.text || null,
					raw,
					sentAt,
				},
			});
		} catch (error) {
			if (isPrismaUniqueViolation(error)) {
				const duplicate = await this.db.socialMessage.findUnique({
					where: {
						threadId_externalMessageId: {
							threadId: thread.id,
							externalMessageId: event.externalMessageId,
						},
					},
					select: { id: true },
				});
				return {
					ok: true,
					duplicate: true,
					messageId: duplicate?.id ?? null,
					threadId: thread.id,
					approvalRequired: true,
					reviewReason: "Duplicate event was already stored.",
					draft: null,
					reply: null,
				};
			}
			throw error;
		}

		await this.db.socialThread.update({
			where: { id: thread.id },
			data: {
				lastMessageAt: sentAt,
				messageCount: { increment: 1 },
			},
		});

		try {
			await this.agent.socialMessageReceived({
				threadId: thread.id,
				messageId: created.id,
				channel: SocialChannel.WHATSAPP,
				reason: autoReply
					? "New inbound WhatsApp Web message received. Eve classified the reply as low risk."
					: "New inbound WhatsApp Web message requires Eve review before replying.",
			});
		} catch (error) {
			this.logger.warn(
				`Could not queue WhatsApp Eve draft: ${error instanceof Error ? error.message : "unknown"}`,
			);
		}

		this.logger.log({
			message: "WhatsApp Web inbound message stored",
			messageId: created.id,
			threadId: thread.id,
			hasDraft: Boolean(draft?.text),
		});

		return {
			ok: true,
			duplicate: false,
			messageId: created.id,
			threadId: thread.id,
			draft: draft?.text ?? null,
			approvalRequired: !autoReply,
			reviewReason: autoReply
				? null
				: (draft?.reason ?? "AI provider is not configured."),
			reply: autoReply,
		};
	}

	private async findOrCreateContact(
		name: string | null | undefined,
		phone: string | null | undefined,
	) {
		const candidates = contactPhoneCandidates(phone ? phone.trim() : null);
		if (candidates.length) {
			const existing = await this.db.contact.findFirst({
				where: { phone: { in: candidates } },
			});
			if (existing) return existing;
		}

		if (!phone?.trim()) return null;
		const { firstName, lastName } = firstNameAndLastName(name);
		return this.db.contact.create({
			data: {
				firstName,
				lastName,
				phone: normalizePhone(phone) ?? phone.trim(),
				source: RecordSource.IMPORT,
			},
		});
	}

	private async draft(
		name: string | null | undefined,
		inbound: string,
	): Promise<EveReplyDecision | null> {
		const key = process.env.OPENAI_API_KEY;
		if (!key) return null;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 12_000);
		try {
			const response = await fetch(
				"https://api.openai.com/v1/chat/completions",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${key}`,
						"Content-Type": "application/json",
					},
					signal: controller.signal,
					body: JSON.stringify({
						model: process.env.EVE_OPENAI_MODEL || "gpt-4.1-mini",
						temperature: 0.25,
						max_tokens: 220,
						messages: [
							{
								role: "system",
								content:
									"Eres Eve, appointment setter de Braxel. Braxel crea páginas web orientadas a conversión y automatiza atención y seguimiento por WhatsApp para recuperar oportunidades y carritos abandonados. Responde en español, con calidez y precisión, entre 40 y 90 palabras, haciendo como máximo una pregunta. Descubre primero el contexto, conecta solo problemas evidenciados con la oferta, no inventes precios, resultados, disponibilidad, clientes ni integraciones. Si preguntan precio, contrato, legalidad, privacidad, garantía, piden una propuesta detallada, expresan que no desean contacto, piden una acción sensible o existe ambigüedad, devuelve exactamente HANDOFF. Si hay interés, propone una llamada de diagnóstico sin confirmar una cita. Devuelve solo el mensaje final o HANDOFF.",
							},
							{
								role: "user",
								content: `Nombre: ${name?.trim() || "desconocido"}\nMensaje entrante: ${inbound}`,
							},
						],
					}),
				},
			);
			if (!response.ok) return null;
			const json = (await response.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};
			const text = json.choices?.[0]?.message?.content?.trim();
			if (!text || text.length > 1200)
				return {
					text: null,
					requiresHuman: true,
					reason: "Eve did not return a safe reply.",
				};
			if (text.toUpperCase() === "HANDOFF")
				return {
					text: null,
					requiresHuman: true,
					reason: "Eve classified the conversation as requiring human review.",
				};
			return {
				text,
				requiresHuman: false,
				reason: "Eve classified the reply as low risk.",
			};
		} catch (error) {
			this.logger.warn(
				`WhatsApp draft failed: ${error instanceof Error ? error.message : "unknown"}`,
			);
			return null;
		} finally {
			clearTimeout(timeout);
		}
	}
}

function isPrismaUniqueViolation(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: string }).code === "P2002"
	);
}
