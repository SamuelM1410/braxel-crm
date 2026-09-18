import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

const Input = z.object({
	threadId: z.string().min(1),
	messageId: z.string().min(1).optional(),
	limit: z.number().int().min(1).max(50).default(20),
});

export default defineTool({
	description:
		"Read the CRM social thread and its recent messages. Use this before preparing a reply. It contains the channel, sender ids, evidence, opt-out context and the latest inbound message.",
	inputSchema: Input,
	async execute(input) {
		const thread = await db.socialThread.findUnique({
			where: { id: input.threadId },
			include: {
				contact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						phone: true,
						whatsappUrl: true,
					},
				},
				company: {
					select: { id: true, name: true, domain: true, website: true },
				},
				messages: { orderBy: { sentAt: "desc" }, take: input.limit },
			},
		});
		if (!thread) return { found: false as const };
		return {
			found: true as const,
			thread: {
				id: thread.id,
				channel: thread.channel,
				externalSenderId: thread.externalSenderId,
				externalRecipientId: thread.externalRecipientId,
				contact: thread.contact,
				company: thread.company,
			},
			messages: [...thread.messages].reverse().map((message) => ({
				id: message.id,
				externalMessageId: message.externalMessageId,
				direction: message.direction,
				body: message.body,
				sentAt: message.sentAt.toISOString(),
			})),
			latestMessageId:
				input.messageId ?? thread.messages[0]?.externalMessageId ?? null,
		};
	},
});
