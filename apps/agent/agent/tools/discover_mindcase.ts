import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";

const Agent = z.enum([
	"instagram/profiles",
	"instagram/posts",
	"tiktok/profiles",
	"tiktok/posts",
	"linkedin/profiles",
	"linkedin/companies",
	"linkedin/posts",
	"facebook/pages",
	"facebook/posts-groups",
]);

const Row = z
	.object({
		id: z.union([z.string(), z.number()]).optional(),
		name: z.string().optional(),
		company_name: z.string().optional(),
		companyName: z.string().optional(),
		business_name: z.string().optional(),
		website: z.string().url().optional(),
		website_url: z.string().url().optional(),
		phone: z.string().optional(),
		phone_number: z.string().optional(),
		email: z.string().email().optional(),
		profile_url: z.string().url().optional(),
		instagram_url: z.string().url().optional(),
		facebook_url: z.string().url().optional(),
		tiktok_url: z.string().url().optional(),
		linkedin_url: z.string().url().optional(),
	})
	.passthrough();

const Response = z
	.object({ data: z.union([z.array(Row), Row]).optional() })
	.passthrough();

export default defineTool({
	description:
		"Discover public business signals with Mindcase. Return candidates and evidence only. Never send messages, never import records, and never treat discovery as qualification.",
	inputSchema: z.object({
		agent: Agent.default("instagram/profiles"),
		query: z.string().trim().min(2).max(240),
		limit: z.number().int().min(1).max(20).default(20),
	}),
	async execute({ agent, query, limit }) {
		const key = process.env.MINDCASE_API_KEY?.trim();
		if (!key) return unavailable("MINDCASE_API_KEY");
		const response = await fetch(
			`https://api.mindcase.co/v1/data/${agent}/run?wait=true`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${key}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ params: { query, limit } }),
				signal: AbortSignal.timeout(90_000),
			},
		);
		if (!response.ok)
			return {
				ok: false as const,
				reason: `Mindcase returned HTTP ${response.status}.`,
			};
		const parsed = Response.safeParse(await response.json());
		if (!parsed.success)
			return { ok: false as const, reason: "Mindcase returned an unsupported shape." };
		const rows = Array.isArray(parsed.data.data)
			? parsed.data.data
			: parsed.data.data
				? [parsed.data.data]
				: [];
		return {
			ok: true as const,
			provider: "mindcase" as const,
			agent,
			query,
			candidates: rows.slice(0, limit),
			count: Math.min(rows.length, limit),
			guardrail:
				"Estos son candidatos públicos. Eve debe investigar evidencia y pedir aprobación antes de cualquier contacto.",
		};
	},
});
