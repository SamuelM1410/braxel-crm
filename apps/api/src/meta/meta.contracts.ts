import { z } from "zod";

export const setMetaAssistantInput = z.object({ enabled: z.boolean() });
export const metaThreadsInput = z.object({
	limit: z.number().int().min(1).max(50).default(20),
});
