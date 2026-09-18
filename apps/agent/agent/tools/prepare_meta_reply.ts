import { defineTool } from "eve/tools";
import { z } from "zod";

const Input = z.object({
	threadId: z.string().min(1),
	channel: z.enum(["FACEBOOK", "INSTAGRAM", "WHATSAPP"]),
	inboundMessageId: z.string().min(1),
	inboundReceivedAt: z.string().datetime(),
	draftBody: z.string().min(10).max(4096),
	doNotContact: z.boolean().default(false),
	requiresHumanApproval: z.boolean().default(true),
});

export default defineTool({
	description:
		"Prepare a reply for an existing inbound Meta conversation. Never starts a conversation, never sends bulk messages, never bypasses Meta policy, and always returns a human-approved draft for delivery.",
	inputSchema: Input,
	async execute(input) {
		if (input.doNotContact)
			return {
				status: "blocked",
				reason: "CONTACT_SUPPRESSED",
				threadId: input.threadId,
			};
		return {
			status: "draft_ready",
			channel: input.channel,
			threadId: input.threadId,
			inboundMessageId: input.inboundMessageId,
			inboundReceivedAt: input.inboundReceivedAt,
			body: input.draftBody,
			requiresHumanApproval: input.requiresHumanApproval,
			sendPolicy: "REPLY_ONLY_AFTER_INBOUND",
			audit: {
				createdAt: new Date().toISOString(),
				source: "EVE_META_REPLY_DRAFT",
			},
		};
	},
});
