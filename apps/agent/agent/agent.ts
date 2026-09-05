import "@crm/env/load";

import { openai } from "@ai-sdk/openai";
import { onTelemetryProblem, syncVersion } from "@crm/telemetry";
import type { LanguageModel } from "ai";
import { type AgentDefinition, defineAgent } from "eve";
import { logCapabilities } from "./lib/capabilities";

void logCapabilities();

onTelemetryProblem((message) => console.debug(`[telemetry] ${message}`));

void syncVersion();

// Eve normally accepts a gateway model string.  We deliberately pass the
// provider-authored model here so production uses OpenAI directly instead of
// Vercel AI Gateway/OIDC.  The key stays server-side in Vercel as
// OPENAI_API_KEY and is never exposed to the CRM browser or committed to git.
const model: LanguageModel = openai(
	process.env.EVE_OPENAI_MODEL?.trim() || "gpt-4.1-mini",
);

export default defineAgent({
	model,
	reasoning: "medium",
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 50_000,
		sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
}) as AgentDefinition;
