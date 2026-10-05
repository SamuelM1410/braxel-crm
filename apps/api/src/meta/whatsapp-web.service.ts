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

export const whatsappWebOutboundSchema = z.object({
	channel: z.literal("WHATSAPP_WEB_PILOT"),
	externalMessageId: z.string().trim().min(1).max(240),
	externalSenderId: z.string().trim().min(1).max(240),
	text: z.string().min(1).max(8000),
	replyMode: z.enum(["AUTO_REPLY", "REVIEW_REQUIRED"]).default("AUTO_REPLY"),
	sentAt: z.coerce.date().optional(),
});

export type WhatsAppWebOutbound = z.infer<typeof whatsappWebOutboundSchema>;

type EveReplyDecision = {
	text: string | null;
	requiresHuman: boolean;
	reason: string;
};

type ConversationTurn = {
	direction: string;
	body: string | null;
};

export type SalesStage =
	| "NEW"
	| "QUALIFYING"
	| "INTERESTED"
	| "OBJECTION"
	| "CALL_REQUESTED"
	| "HANDOFF"
	| "OPT_OUT";

export type SalesSignal = {
	stage: SalesStage;
	intent: string;
	score: number;
	topics: string[];
	nextAction: string;
};

const salesStageRank: Record<SalesStage, number> = {
	NEW: 1,
	QUALIFYING: 2,
	INTERESTED: 3,
	OBJECTION: 3,
	CALL_REQUESTED: 4,
	HANDOFF: 5,
	OPT_OUT: 0,
};

function classifySalesSignal(text: string): SalesSignal {
	const normalized = text.toLocaleLowerCase("es");
	const topics: string[] = [];
	if (/\b(web|página|sitio|landing|tienda online)\b/.test(normalized))
		topics.push("website");
	if (/\b(whatsapp|chat|mensaje|atención|cliente)\b/.test(normalized))
		topics.push("whatsapp");
	if (/\b(venta|ventas|vender|conversión|convertir|carrito)\b/.test(normalized))
		topics.push("conversion");
	if (
		/\b(precio|costo|coste|caro|barato|cotización|presupuesto)\b/.test(
			normalized,
		)
	)
		topics.push("pricing");

	if (
		/(no me escrib(?:as|an|ir)?|no contactar|no contactes|no me interesa|no estoy interesado|baja|stop|unsubscribe|salir)/.test(
			normalized,
		)
	) {
		return {
			stage: "OPT_OUT",
			intent: "opt_out",
			score: 0,
			topics,
			nextAction: "No responder automáticamente y detener el seguimiento.",
		};
	}
	if (
		/\b(llamada|llamar|agendar|agenda|reunión|reunion|hablar)\b/.test(
			normalized,
		)
	) {
		return {
			stage: "CALL_REQUESTED",
			intent: "call_request",
			score: 88,
			topics,
			nextAction: "Derivar a una persona para confirmar la llamada.",
		};
	}
	if (
		/\b(caro|precio|pensarlo|pensarlo bien|tiempo|no estoy seguro|ya tengo web|ya tenemos web)\b/.test(
			normalized,
		)
	) {
		return {
			stage: "OBJECTION",
			intent: "objection",
			score: 56,
			topics,
			nextAction:
				"Validar la objeción, responder con valor y hacer una sola pregunta.",
		};
	}
	if (
		/\b(quiero|interesa|me interesa|necesito|cómo funciona|como funciona|más información|mas informacion|mejorar ventas|cotización|cotizacion)\b/.test(
			normalized,
		)
	) {
		return {
			stage: "INTERESTED",
			intent: "purchase_interest",
			score: 70,
			topics,
			nextAction: "Calificar el negocio y proponer un diagnóstico si encaja.",
		};
	}
	if (text.trim()) {
		return {
			stage: "QUALIFYING",
			intent: "information_request",
			score: 34,
			topics,
			nextAction:
				"Entender el negocio y el problema antes de presentar la oferta.",
		};
	}
	return {
		stage: "NEW",
		intent: "empty_message",
		score: 10,
		topics,
		nextAction: "Solicitar el mensaje por texto o una aclaración.",
	};
}

function salesFromRaw(raw: unknown): SalesSignal | null {
	if (!raw || typeof raw !== "object") return null;
	const sales = (raw as Record<string, unknown>).sales;
	if (!sales || typeof sales !== "object") return null;
	const value = sales as Record<string, unknown>;
	if (typeof value.stage !== "string" || !(value.stage in salesStageRank))
		return null;
	return {
		stage: value.stage as SalesStage,
		intent: typeof value.intent === "string" ? value.intent : "unknown",
		score: typeof value.score === "number" ? value.score : 0,
		topics: Array.isArray(value.topics)
			? value.topics.filter(
					(topic): topic is string => typeof topic === "string",
				)
			: [],
		nextAction:
			typeof value.nextAction === "string"
				? value.nextAction
				: "Review the conversation.",
	};
}

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

function enforceSingleQuestion(text: string): string {
	let questionCount = 0;
	const withOnePairedQuestion = text.replace(/¿[^?]*\?/g, (question) => {
		questionCount += 1;
		if (questionCount === 1) return question;
		return `${question
			.slice(1, -1)
			.trim()
			.replace(/[.!?]+$/, "")}.`;
	});
	// Models occasionally omit the opening `¿`. Keep the first remaining
	// question mark and turn any later ones into sentence punctuation so a
	// single reply never interrogates a prospect repeatedly.
	let questionMarkCount = 0;
	return withOnePairedQuestion.replace(/\?/g, () => {
		questionMarkCount += 1;
		return questionMarkCount === 1 ? "?" : ".";
	});
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

	assertMetricsAuthorization(
		authorization: string | undefined,
		hasSession: boolean,
	) {
		if (hasSession) return;
		this.assertAuthorization(authorization);
	}

	health() {
		return {
			ok: true,
			inboundOnly: true,
			autoReplyMode: this.autoReplyMode(),
			webhookConfigured: Boolean(this.webhookSecret()),
		};
	}

	async salesMetrics() {
		const threads = await this.db.socialThread.findMany({
			where: { channel: SocialChannel.WHATSAPP },
			orderBy: { lastMessageAt: "desc" },
			select: {
				id: true,
				lastMessageAt: true,
				contact: {
					select: {
						id: true,
						calendarEvents: { select: { id: true, status: true } },
						deals: { select: { deal: { select: { stage: true } } } },
					},
				},
				messages: {
					orderBy: { sentAt: "asc" },
					select: { direction: true, body: true, raw: true, sentAt: true },
				},
			},
		});
		const stages: Record<SalesStage, number> = {
			NEW: 0,
			QUALIFYING: 0,
			INTERESTED: 0,
			OBJECTION: 0,
			CALL_REQUESTED: 0,
			HANDOFF: 0,
			OPT_OUT: 0,
		};
		let inboundMessages = 0;
		let outboundMessages = 0;
		let automaticReplies = 0;
		let humanReviews = 0;
		let callRequests = 0;
		let optOuts = 0;
		let totalReplyWords = 0;
		let repliesWithText = 0;
		const bookedCallContacts = new Set<string>();
		const wonDealContacts = new Set<string>();
		for (const thread of threads) {
			if (thread.contact) {
				if (
					thread.contact.calendarEvents.some(
						(event) => !/cancel|declin/i.test(event.status),
					)
				)
					bookedCallContacts.add(thread.contact.id);
				if (
					thread.contact.deals.some((item) => item.deal.stage === "CLOSED_WON")
				)
					wonDealContacts.add(thread.contact.id);
			}
			let latestSignal: SalesSignal | null = null;
			for (const message of thread.messages) {
				if (message.direction === EmailDirection.INBOUND) {
					inboundMessages += 1;
					const inboundRaw =
						message.raw && typeof message.raw === "object"
							? (message.raw as Record<string, unknown>)
							: {};
					if (inboundRaw.approvalStatus === "REVIEW_REQUIRED")
						humanReviews += 1;
					const signal = salesFromRaw(message.raw);
					if (signal && signal.stage === "OPT_OUT") {
						latestSignal = signal;
					} else if (
						signal &&
						latestSignal?.stage !== "OPT_OUT" &&
						(!latestSignal ||
							salesStageRank[signal.stage] >=
								salesStageRank[latestSignal.stage])
					) {
						latestSignal = signal;
					}
				} else {
					outboundMessages += 1;
					const raw =
						message.raw && typeof message.raw === "object"
							? (message.raw as Record<string, unknown>)
							: {};
					if (raw.replyMode === "AUTO_REPLY") automaticReplies += 1;
					if (raw.replyMode === "REVIEW_REQUIRED") humanReviews += 1;
					if (message.body?.trim()) {
						totalReplyWords += message.body.trim().split(/\s+/).length;
						repliesWithText += 1;
					}
				}
			}
			if (latestSignal) {
				stages[latestSignal.stage] += 1;
				if (latestSignal.stage === "CALL_REQUESTED") callRequests += 1;
				if (latestSignal.stage === "OPT_OUT") optOuts += 1;
			}
		}
		const qualifiedLeads =
			stages.INTERESTED +
			stages.OBJECTION +
			stages.CALL_REQUESTED +
			stages.HANDOFF;
		const callsBooked = bookedCallContacts.size;
		const dealsWon = wonDealContacts.size;
		const recommendations: string[] = [];
		if (inboundMessages > 0 && qualifiedLeads === 0)
			recommendations.push(
				"Añade una pregunta de calificación después de cada primer contacto.",
			);
		if (callRequests > 0 && callsBooked === 0)
			recommendations.push(
				"Confirma las solicitudes de llamada dentro de diez minutos.",
			);
		if (repliesWithText > 0 && totalReplyWords / repliesWithText > 85)
			recommendations.push(
				"Reduce las respuestas automáticas a menos de ochenta palabras.",
			);
		if (optOuts > 0)
			recommendations.push("Detén el seguimiento tras una solicitud de baja.");
		if (qualifiedLeads > 0 && dealsWon === 0)
			recommendations.push(
				"Registra el resultado de cada llamada para ajustar el guion.",
			);
		return {
			ok: true,
			generatedAt: new Date().toISOString(),
			totalConversations: threads.length,
			inboundMessages,
			outboundMessages,
			automaticReplies,
			humanReviews,
			qualifiedLeads,
			callRequests,
			callsBooked,
			dealsWon,
			callBookingRate: qualifiedLeads
				? Math.round((callsBooked / qualifiedLeads) * 1000) / 10
				: 0,
			closeRate: qualifiedLeads
				? Math.round((dealsWon / qualifiedLeads) * 1000) / 10
				: 0,
			optOuts,
			averageReplyWords: repliesWithText
				? Math.round((totalReplyWords / repliesWithText) * 10) / 10
				: 0,
			stages,
			recommendations,
			lastMessageAt: threads[0]?.lastMessageAt?.toISOString() ?? null,
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

		const history = await this.db.socialMessage.findMany({
			where: { threadId: thread.id },
			orderBy: { sentAt: "desc" },
			take: 8,
			select: { direction: true, body: true },
		});
		const classifiedSales = classifySalesSignal(event.text);
		const draft =
			event.text.trim() && classifiedSales.stage !== "OPT_OUT"
				? await this.draft(event.name, event.text, history.reverse())
				: null;
		const sales: SalesSignal =
			draft?.requiresHuman && classifiedSales.stage !== "CALL_REQUESTED"
				? {
						...classifiedSales,
						stage: "HANDOFF",
						intent: "human_handoff",
						score: Math.max(classifiedSales.score, 75),
						nextAction: "Revisar el mensaje y responder como persona.",
					}
				: classifiedSales;
		const autoReply =
			draft?.text &&
			!draft.requiresHuman &&
			sales.stage !== "CALL_REQUESTED" &&
			sales.stage !== "OPT_OUT" &&
			this.autoReplyMode() === "smart"
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
			sales: {
				...sales,
				detectedAt: sentAt.toISOString(),
				replyMode: autoReply ? "AUTO_REPLY" : "REVIEW_REQUIRED",
			},
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
				: sales.stage === "OPT_OUT"
					? "Opt-out detected; no automatic reply will be sent."
					: sales.stage === "CALL_REQUESTED"
						? "The lead requested a call; confirm the appointment as a person."
						: (draft?.reason ?? "AI provider is not configured."),
			reply: autoReply,
			sales,
		};
	}

	async recordOutbound(input: unknown) {
		const parsed = whatsappWebOutboundSchema.safeParse(input);
		if (!parsed.success) {
			throw new BadRequestException({
				message: "Invalid WhatsApp Web outbound payload.",
				issues: parsed.error.issues.map((issue) => ({
					path: issue.path.join("."),
					message: issue.message,
				})),
			});
		}
		const event = parsed.data;
		const thread = await this.db.socialThread.findUnique({
			where: {
				channel_externalThreadId: {
					channel: SocialChannel.WHATSAPP,
					externalThreadId: `web:${event.externalSenderId}`,
				},
			},
			select: { id: true },
		});
		if (!thread)
			throw new BadRequestException("WhatsApp thread was not found.");
		const sentAt = event.sentAt ?? new Date();
		try {
			const created = await this.db.socialMessage.create({
				data: {
					threadId: thread.id,
					externalMessageId: event.externalMessageId,
					direction: EmailDirection.OUTBOUND,
					senderId: event.externalSenderId,
					body: event.text,
					raw: {
						source: event.channel,
						replyMode: event.replyMode,
						receivedAt: sentAt.toISOString(),
					},
					sentAt,
				},
			});
			await this.db.socialThread.update({
				where: { id: thread.id },
				data: { lastMessageAt: sentAt, messageCount: { increment: 1 } },
			});
			return {
				ok: true,
				duplicate: false,
				messageId: created.id,
				threadId: thread.id,
			};
		} catch (error) {
			if (isPrismaUniqueViolation(error)) {
				return { ok: true, duplicate: true, threadId: thread.id };
			}
			throw error;
		}
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
		history: ConversationTurn[],
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
									"Eres Eve, asesora de ventas consultivas y appointment setter de Braxel. Braxel ofrece dos cosas: (1) rediseño de páginas web orientado a conversión; y (2) para tiendas online, una automatización sencilla de WhatsApp que ayuda a recuperar carritos abandonados y comunicar promociones a clientes. El CRM, el scraper y las herramientas internas no son productos que se vendan: nunca los menciones. Tu objetivo es convertir conversaciones adecuadas en llamadas de diagnóstico calificadas, sin prometer resultados. Avanza una etapa por mensaje y usa el contexto disponible. Responde en español natural, cálido y seguro, entre 35 y 75 palabras, con una sola pregunta clara. Antes de vender, entiende quién respondió, qué relación tiene con el negocio y qué contexto ya existe en el chat.\n\nUsa este marco: (1) conecta con las palabras exactas de la persona; (2) descubre una situación o problema; (3) aclara el impacto comercial; (4) relaciona solo ese problema con un beneficio concreto de Braxel; (5) pide un siguiente paso pequeño. Haz una sola pregunta de alto valor. Prioriza negocio, objetivo, canal actual, oportunidades perdidas, urgencia o volumen. No repitas una pregunta respondida en el historial. No conviertas la conversación en un formulario.\n\nEstrategia: si el mensaje es solo un saludo, un emoji, un nombre, una respuesta automática o no hay señales claras de que sea una cuenta empresarial, no presentes la oferta todavía. Saluda y pregunta con naturalidad si hablas con la persona que lleva el negocio o las decisiones de la empresa. Si no es la persona encargada, pregunta una sola vez si existe un contacto adecuado; si no puede darlo, agradece y cierra. Cuando confirme que sí es la persona encargada, pregunta primero por una prioridad concreta antes de explicar Braxel. Si no es una tienda online, no presentes la automatización de carritos: enfócate únicamente en el rediseño web y pregunta qué parte de la página quieren mejorar. Si sí vende online, pregunta por el recorrido de compra, carritos abandonados o promociones antes de explicar la automatización. Ante interés, diagnostica antes de explicar el servicio completo. Ante 'mándame información', resume solo el beneficio que encaja y pregunta cuál prioridad pesa más. Ante 'ya tengo web', pregunta qué parte no convierte y diferencia una web bonita de una web que convierte. Ante una objeción, valida primero, responde con un beneficio verificable y pide permiso para continuar. Si la persona indica que este canal es solo para pacientes, que no atiende temas comerciales, que este no es el canal o que no puede ayudar, agradece la aclaración con una sola despedida breve, sin pregunta ni oferta, y no vuelvas a insistir. Ante 'lo voy a pensar', 'luego', 'ahora no', 'gracias', 'ok' o una respuesta sin información nueva, devuelve exactamente NO_REPLY: no insistas ni abras otra pregunta. Si ya hiciste una pregunta y no fue respondida, no la repitas. Personaliza con el nombre y los datos del historial. Nunca inventes precios, resultados, clientes, funciones o disponibilidad. No uses presión, urgencia falsa, culpa ni mensajes masivos.\n\nCuando exista encaje, propone una llamada de diagnóstico y explica el objetivo en una frase. No confirmes fecha, hora, precio, contrato o condiciones sin una persona. No envíes seguimientos proactivos desde este flujo; responde solo al mensaje recibido.\n\nDevuelve exactamente HANDOFF si preguntan por precio o cotización concreta, contrato, legalidad, privacidad, garantía, reembolsos, disponibilidad específica, una propuesta detallada, una queja, una solicitud de baja, una acción sensible o datos insuficientes para responder con seguridad. Devuelve NO_REPLY si insistir sería inoportuno. Devuelve HANDOFF si la persona pide hablar con alguien. Si hay interés y no se necesita intervención humana, propone la llamada sin confirmar fecha ni hora. Devuelve solo el mensaje final, HANDOFF o NO_REPLY.",
							},
							{
								role: "system",
								content:
									"Actualización del catálogo de Braxel y del estilo de conversación: esta instrucción supersede cualquier descripción abreviada anterior. Braxel puede diseñar e implementar, según el diagnóstico y el alcance acordado: (1) páginas web corporativas o de servicio; (2) aplicaciones web a medida; (3) tiendas online y páginas ecommerce; (4) rediseño y CRO para mejorar claridad, confianza y conversión; y (5) sistemas de recompra para ecommerce, inspirados en el caso del video: captura voluntaria y segmentación de clientes, bienvenida, recuperación de carritos abandonados, campañas por segmentos, reseñas poscompra, recompra, promociones de temporada y experimentos A/B. No presentes todas las soluciones juntas ni afirmes que una función ya está activa si no fue confirmada. El CRM y el scraper son herramientas internas, no productos.\n\nNo abras con una presentación genérica como 'Hola, somos una agencia de marketing especializada en...'. Responde al contexto concreto del mensaje y de la empresa. Si solo hay un saludo, usa una respuesta humana y breve, por ejemplo: 'Hola, ¿hablo con la persona que lleva la parte comercial o digital de [empresa]?'. Tras confirmar a la persona, formula una sola pregunta de diagnóstico: si su prioridad es mejorar la web, vender online, recuperar compras incompletas, automatizar una operación o construir una aplicación. Relaciona después una sola solución con lo que la persona dijo. Habla como una asesora consultiva: escucha, resume, pregunta y avanza; no recites servicios, no hagas interrogatorios y no presiones. Si el negocio no vende online, no menciones carritos ni recompra. Si no hay encaje, agradece y cierra. Si piden no contactar, si el canal no es comercial o no responden a la pregunta anterior, devuelve NO_REPLY y detén el seguimiento.",
							},
							{
								role: "user",
								content: `Nombre: ${name?.trim() || "desconocido"}\nHistorial reciente:\n${
									history
										.map(
											(turn) =>
												`${turn.direction}: ${(turn.body ?? "").slice(0, 800)}`,
										)
										.join("\n") || "(sin historial)"
								}\nMensaje entrante: ${inbound}`,
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
			if (text.toUpperCase() === "NO_REPLY")
				return {
					text: null,
					requiresHuman: true,
					reason:
						"Eve chose not to insist because the lead gave no new signal.",
				};
			const safeText = enforceSingleQuestion(text);
			return {
				text: safeText,
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
