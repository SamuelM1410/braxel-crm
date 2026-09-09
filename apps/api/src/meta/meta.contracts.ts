import { z } from "zod";

export const setMetaAssistantInput = z.object({ enabled: z.boolean() });
