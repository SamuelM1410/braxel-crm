import { createHmac, timingSafeEqual } from "node:crypto";
import { type Db, EmailDirection, SocialChannel } from "@crm/db";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { MetaClient } from "./meta.client";
import { MetaTokenService } from "./meta-token.service";

type MessagingEvent = {
	sender?: { id?: string };
	recipient?: { id?: string };
	timestamp?: number;
	message?: { mid?: string; text?: string; is_echo?: boolean };
};
type MetaPayload = {
	object?: string;
	entry?: Array<{ id?: string; messaging?: MessagingEvent[] }>;
};

@Injectable()
export class MetaWebhookService {
	private readonly logger = new Logger(MetaWebhookService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: ConfigService<EnvironmentVariables, true>,
		private readonly client: MetaClient,
		private readonly tokens: MetaTokenService,
	) {}

	verify(mode?: string, token?: string) {
		const expected = this.config.get("META_WEBHOOK_VERIFY_TOKEN", {
			infer: true,
		});
		return mode === "subscribe" && Boolean(expected) && token === expected;
	}

	async receive(raw: Buffer, signature: string | string[] | undefined) {
		this.assertSignature(
			raw,
			Array.isArray(signature) ? signature[0] : signature,
		);
		let payload: MetaPayload;
		try {
			payload = JSON.parse(raw.toString("utf8")) as MetaPayload;
		} catch {
			throw new BadRequestException("Invalid Meta webhook JSON.");
		}
		if (payload.object !== "page" && payload.object !== "instagram") return;

		for (const entry of payload.entry ?? []) {
			for (const event of entry.messaging ?? [])
				await this.ingest(payload.object, entry.id, event);
		}
	}

	private async ingest(
		object: string,
		entryId: string | undefined,
		event: MessagingEvent,
	) {
		const senderId = event.sender?.id;
		const recipientId = event.recipient?.id ?? entryId;
		const message = event.message;
		if (!senderId || !recipientId || !message?.mid || message.is_echo) return;
		const page = await this.db.metaPage.findFirst({
			where: {
				enabled: true,
				OR: [
					{ pageId: recipientId },
					{ instagramBusinessAccountId: recipientId },
				],
			},
			include: { connection: true },
		});
		if (!page) return;
		const channel =
			object === "instagram" || page.instagramBusinessAccountId === recipientId
				? SocialChannel.INSTAGRAM
				: SocialChannel.FACEBOOK;
		const sentAt = new Date(event.timestamp ?? Date.now());
		const externalThreadId = `${recipientId}:${senderId}`;
		const thread = await this.db.socialThread.upsert({
			where: { channel_externalThreadId: { channel, externalThreadId } },
			create: {
				channel,
				externalThreadId,
				externalSenderId: senderId,
				externalRecipientId: recipientId,
				firstMessageAt: sentAt,
				lastMessageAt: sentAt,
				messageCount: 1,
			},
			update: { lastMessageAt: sentAt, messageCount: { increment: 1 } },
		});
		const created = await this.db.socialMessage
			.create({
				data: {
					threadId: thread.id,
					externalMessageId: message.mid,
					direction: EmailDirection.INBOUND,
					senderId,
					body: message.text ?? null,
					raw: event,
					sentAt,
				},
			})
			.catch(() => null);
		if (!created || !page.connection.replyAssistantEnabled || !message.text)
			return;
		const reply = await this.draft(message.text);
		if (!reply) return;
		try {
			const containerId =
				channel === SocialChannel.INSTAGRAM
					? (page.instagramBusinessAccountId ?? page.pageId)
					: page.pageId;
			const result = await this.client.send(
				containerId,
				this.tokens.decrypt(page.encryptedPageAccessToken),
				senderId,
				reply,
			);
			const id =
				typeof result === "object" && result && "message_id" in result
					? String(result.message_id)
					: `eve:${message.mid}`;
			await this.db.socialMessage.create({
				data: {
					threadId: thread.id,
					externalMessageId: id,
					direction: EmailDirection.OUTBOUND,
					senderId: containerId,
					body: reply,
					raw: JSON.parse(JSON.stringify(result)),
					sentAt: new Date(),
				},
			});
		} catch (error) {
			this.logger.warn(
				`Meta reply failed: ${error instanceof Error ? error.message : "unknown"}`,
			);
		}
	}

	private assertSignature(raw: Buffer, signature?: string) {
		const secret = this.config.get("META_APP_SECRET", { infer: true });
		if (!secret || !signature?.startsWith("sha256="))
			throw new BadRequestException("Missing Meta signature.");
		const expected = Buffer.from(
			createHmac("sha256", secret).update(raw).digest("hex"),
		);
		const supplied = Buffer.from(signature.slice(7));
		if (
			expected.length !== supplied.length ||
			!timingSafeEqual(expected, supplied)
		)
			throw new BadRequestException("Invalid Meta signature.");
	}

	private async draft(inbound: string) {
		if (
			/\b(stop|baja|no contactar|no escrib|unsubscribe|queja|abogado|legal|privacidad|precio|cotizaci[oó]n|contrato)\b/i.test(
				inbound,
			)
		)
			return null;
		const key = process.env.OPENAI_API_KEY;
		if (!key) return null;
		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: process.env.EVE_OPENAI_MODEL || "gpt-4.1-mini",
				temperature: 0.25,
				max_tokens: 180,
				messages: [
					{
						role: "user",
						content: `Eres Eve, asistente comercial de Braxel. Responde en español al siguiente mensaje entrante de Facebook o Instagram. Este contacto inició o continuó la conversación: nunca haces prospección masiva. Sé útil, natural y breve (40-90 palabras), usa máximo una pregunta y busca entender el problema antes de ofrecer. No inventes precios, resultados, disponibilidad, pruebas ni datos. Si piden precio, contrato, tratamiento de datos, presentan una queja, piden no contacto o la situación es ambigua, devuelve exactamente HANDOFF. Mensaje: ${inbound}`,
					},
				],
			}),
		});
		if (!response.ok) return null;
		const json = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const output = json.choices?.[0]?.message?.content?.trim();
		return output && output !== "HANDOFF" && output.length <= 1200
			? output
			: null;
	}
}
