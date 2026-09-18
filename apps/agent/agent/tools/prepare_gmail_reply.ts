import { defineTool } from "eve/tools";
import { z } from "zod";

const ReplyInput = z.object({
	threadId: z
		.string()
		.min(1)
		.describe("Existing Gmail thread id; never create a new thread."),
	to: z.string().email(),
	subject: z.string().max(200),
	inboundMessageId: z
		.string()
		.min(1)
		.describe("Message id of the latest inbound message."),
	inboundReceivedAt: z.string().datetime(),
	draftBody: z.string().min(20).max(5000),
	doNotContact: z.boolean().default(false),
});

export default defineTool({
	description:
		"Prepare a Gmail reply draft for an existing inbound conversation. Safety-first: this tool never starts a thread, never sends mail, and refuses opted-out or stale/non-inbound contexts. A human or an approved Gmail sender must perform the final send.",
	inputSchema: ReplyInput,
	async execute(input) {
		if (input.doNotContact) {
			return {
				status: "blocked",
				reason: "CONTACT_SUPPRESSED",
				threadId: input.threadId,
			};
		}
		const received = Date.parse(input.inboundReceivedAt);
		if (
			!Number.isFinite(received) ||
			Date.now() - received > 30 * 24 * 60 * 60 * 1000
		) {
			return {
				status: "blocked",
				reason: "INBOUND_CONTEXT_EXPIRED",
				threadId: input.threadId,
			};
		}
		return {
			status: "draft_ready",
			channel: "EMAIL",
			threadId: input.threadId,
			inboundMessageId: input.inboundMessageId,
			to: input.to,
			subject: input.subject.startsWith("Re:")
				? input.subject
				: `Re: ${input.subject}`,
			body: input.draftBody,
			requiresHumanApproval: true,
			sendPolicy: "REPLY_ONLY",
			audit: {
				createdAt: new Date().toISOString(),
				source: "EVE_GMAIL_REPLY_DRAFT",
			},
		};
	},
});
