import { createHmac, timingSafeEqual } from "node:crypto";
import { type Db, EmailDirection, SocialChannel } from "@crm/db";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";

const messagingEventSchema = z
	.object({
		sender: z.object({ id: z.string().optional() }).optional(),
		recipient: z.object({ id: z.string().optional() }).optional(),
		timestamp: z.number().optional(),
		message: z
			.object({
				mid: z.string().optional(),
				text: z.string().optional(),
				is_echo: z.boolean().optional(),
			})
			.optional(),
		postback: z
			.object({
				mid: z.string().optional(),
				title: z.string().optional(),
				payload: z.string().optional(),
			})
			.optional(),
	})
	.passthrough();
const metaPayloadSchema = z
	.object({
		object: z.string().optional(),
		entry: z
			.array(
				z
					.object({
						id: z.string().optional(),
						messaging: z.array(messagingEventSchema).optional(),
					})
					.passthrough(),
			)
			.optional(),
	})
	.passthrough();
type MessagingEvent = z.infer<typeof messagingEventSchema>;

@Injectable()
export class MetaWebhookService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: ConfigService<EnvironmentVariables, true>,
		private readonly agent: AgentTriggerService,
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
		let payload: z.infer<typeof metaPayloadSchema>;
		try {
			const parsed = metaPayloadSchema.safeParse(
				JSON.parse(raw.toString("utf8")),
			);
			if (!parsed.success) throw new Error("invalid payload");
			payload = parsed.data;
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
		const postback = event.postback;
		const externalMessageId = message?.mid ?? postback?.mid;
		const body = message?.text ?? postback?.title ?? postback?.payload;
		if (
			!senderId ||
			!recipientId ||
			!externalMessageId ||
			!body ||
			message?.is_echo
		)
			return;
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
		const existingThread = await this.db.socialThread.findUnique({
			where: { channel_externalThreadId: { channel, externalThreadId } },
			select: { id: true },
		});
		if (existingThread) {
			const existingMessage = await this.db.socialMessage.findUnique({
				where: {
					threadId_externalMessageId: {
						threadId: existingThread.id,
						externalMessageId,
					},
				},
				select: { id: true },
			});
			if (existingMessage) return;
		}
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
					externalMessageId,
					direction: EmailDirection.INBOUND,
					senderId,
					body,
					raw: JSON.parse(JSON.stringify(event)),
					sentAt,
				},
			})
			.catch(() => null);
		if (!created || !page.connection.replyAssistantEnabled) return;
		await this.agent.socialMessageReceived({
			threadId: thread.id,
			messageId: externalMessageId,
			channel,
			reason: "New inbound Meta message requires a human-approved Eve reply.",
		});
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
}
