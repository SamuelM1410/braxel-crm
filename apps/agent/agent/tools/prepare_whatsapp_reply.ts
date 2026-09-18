import { defineTool } from "eve/tools";
import { z } from "zod";

const Input = z.object({
	conversationId: z
		.string()
		.min(1)
		.describe("Existing WhatsApp Business conversation id."),
	customerPhone: z.string().regex(/^\+[1-9]\d{7,14}$/),
	inboundMessageId: z.string().min(1),
	inboundReceivedAt: z.string().datetime(),
	draftBody: z.string().min(10).max(4096),
	optedOut: z.boolean().default(false),
});

export default defineTool({
	description:
		"Prepare a WhatsApp Business reply only after an inbound customer message. Never starts chats, never uses personal WhatsApp, never sends bulk messages. Final delivery must use the official Cloud API/BSP and human approval.",
	inputSchema: Input,
	async execute(input) {
		if (input.optedOut)
			return {
				status: "blocked",
				reason: "CONTACT_SUPPRESSED",
				conversationId: input.conversationId,
			};
		const ageMs = Date.now() - Date.parse(input.inboundReceivedAt);
		if (!Number.isFinite(ageMs) || ageMs > 24 * 60 * 60 * 1000) {
			return {
				status: "blocked",
				reason: "CUSTOMER_SERVICE_WINDOW_EXPIRED",
				conversationId: input.conversationId,
				requiresTemplate: true,
			};
		}
		return {
			status: "draft_ready",
			channel: "WHATSAPP",
			provider: "OFFICIAL_CLOUD_API_OR_BSP",
			conversationId: input.conversationId,
			customerPhone: input.customerPhone,
			inboundMessageId: input.inboundMessageId,
			body: input.draftBody,
			requiresHumanApproval: true,
			sendPolicy: "REPLY_ONLY_WITHIN_24H",
			audit: {
				createdAt: new Date().toISOString(),
				source: "EVE_WHATSAPP_REPLY_DRAFT",
			},
		};
	},
});
