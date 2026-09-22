import { z } from "zod";

export const setMetaAssistantInput = z.object({ enabled: z.boolean() });
export const metaThreadsInput = z.object({
	limit: z.number().int().min(1).max(50).default(20),
});
export const refreshMetaSubscriptionsInput = z.object({
	pageId: z.string().min(1).optional(),
});
export const sendMetaReplyInput = z.object({
	threadId: z.string().min(1),
	body: z.string().trim().min(1).max(2000),
});
