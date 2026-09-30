import { type Db, EmailDirection, Prisma, SocialChannel } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";

export const whatsappWebInboundSchema = z.object({
	channel: z.literal("WHATSAPP_WEB_PILOT").optional(),
	externalMessageId: z.string().trim().min(1).max(500),
	externalSenderId: z.string().trim().min(1).max(320),
	phone: z.string().trim().max(80).nullable().optional(),
	name: z.string().trim().max(200).nullable().optional(),
	text: z.string().max(20_000),
	receivedAt: z.coerce.date(),
});

@Injectable()
export class WhatsAppWebService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: ConfigService<EnvironmentVariables, true>,
		private readonly agent: AgentTriggerService,
	) {}

	async receive(body: unknown, authorization?: string) {
		this.assertAuthorization(authorization);
		const parsed = whatsappWebInboundSchema.safeParse(body);
		if (!parsed.success)
			throw new BadRequestException("Invalid WhatsApp Web inbound event.");

		const input = parsed.data;
		const phone = normalizePhone(input.phone ?? input.externalSenderId);
		const senderId = input.externalSenderId;
		const externalThreadId = `${phone || senderId}`;
		const sentAt = input.receivedAt;
		const existingThread = await this.db.socialThread.findUnique({
			where: {
				channel_externalThreadId: {
					channel: SocialChannel.WHATSAPP,
					externalThreadId,
				},
			},
			select: { id: true },
		});

		if (existingThread) {
			const duplicate = await this.db.socialMessage.findUnique({
				where: {
					threadId_externalMessageId: {
						threadId: existingThread.id,
						externalMessageId: input.externalMessageId,
					},
				},
				select: { id: true },
			});
			if (duplicate)
				return this.result(existingThread.id, true, "Duplicate event ignored.");
		}

		const contact = await this.findContact(phone, input.phone);
		let threadId: string;
		try {
			const stored = await this.db.$transaction(async (tx) => {
				const thread = await tx.socialThread.upsert({
					where: {
						channel_externalThreadId: {
							channel: SocialChannel.WHATSAPP,
							externalThreadId,
						},
					},
					create: {
						channel: SocialChannel.WHATSAPP,
						externalThreadId,
						externalSenderId: senderId,
						externalRecipientId: null,
						contactId: contact?.id ?? null,
						companyId: contact?.companyId ?? null,
						firstMessageAt: sentAt,
						lastMessageAt: sentAt,
						messageCount: 1,
					},
					update: {
						lastMessageAt: sentAt,
						messageCount: { increment: 1 },
						...(contact
							? { contactId: contact.id, companyId: contact.companyId }
							: {}),
					},
				});

				await tx.socialMessage.create({
					data: {
						threadId: thread.id,
						externalMessageId: input.externalMessageId,
						direction: EmailDirection.INBOUND,
						senderId,
						body: input.text,
						raw: JSON.parse(JSON.stringify({ ...input, phone })),
						sentAt,
					},
				});

				return { threadId: thread.id };
			});
			threadId = stored.threadId;
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				const duplicateThread = await this.db.socialThread.findUniqueOrThrow({
					where: {
						channel_externalThreadId: {
							channel: SocialChannel.WHATSAPP,
							externalThreadId,
						},
					},
					select: { id: true },
				});
				return this.result(
					duplicateThread.id,
					true,
					"Duplicate event ignored.",
				);
			}
			throw error;
		}

		await this.agent.socialMessageReceived({
			threadId,
			messageId: input.externalMessageId,
			channel: SocialChannel.WHATSAPP,
			reason:
				"New inbound WhatsApp Web pilot message requires an Eve draft and human approval before delivery.",
		});

		return this.result(
			threadId,
			false,
			"Inbound message stored; draft queued.",
		);
	}

	private async findContact(phone: string | null, rawPhone?: string | null) {
		if (!phone && !rawPhone) return null;
		const digits = phone?.replace(/\D/g, "") ?? "";
		const tail = digits.length >= 7 ? digits.slice(-10) : null;
		const phoneValues = [rawPhone, phone].filter((value): value is string =>
			Boolean(value?.trim()),
		);
		const where = [
			...phoneValues.map((value) => ({ phone: value })),
			...(tail ? [{ phone: { contains: tail } }] : []),
		];
		if (where.length === 0) return null;
		const [contact] = await this.db.contact.findMany({
			where: { OR: where },
			select: { id: true, companyId: true },
			take: 1,
		});
		return contact ?? null;
	}

	private assertAuthorization(authorization?: string) {
		const expected = this.config.get("WHATSAPP_WEBHOOK_SECRET", {
			infer: true,
		});
		if (!expected)
			throw new ServiceUnavailableException(
				"WhatsApp Web bridge is not configured.",
			);
		if (!timingSafeEquals(authorization ?? "", `Bearer ${expected}`))
			throw new BadRequestException("Invalid WhatsApp Web bridge credentials.");
	}

	private result(threadId: string, duplicate: boolean, message: string) {
		return {
			ok: true as const,
			threadId,
			duplicate,
			message,
			reply: null,
			draft: null,
			approvalRequired: true,
		};
	}
}

function normalizePhone(value: string | null | undefined): string | null {
	if (!value) return null;
	const normalized = value.replace(/@c\.us$/i, "").replace(/\D/g, "");
	return normalized || null;
}

function timingSafeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let index = 0; index < a.length; index += 1)
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	return mismatch === 0;
}
