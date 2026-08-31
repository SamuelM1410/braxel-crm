import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertResearchPurpose } from "../lib/session-purpose";

const text = z.string().trim().min(1).max(3000);
const score = z.number().min(0).max(100);

const dossierSchema = z.object({
	version: z.literal("lead-os-eve-v1"),
	generated_at: z.string().datetime(),
	classification: z.object({
		status: z.enum(["REVIEW_REQUIRED", "RESEARCH_MORE", "DISQUALIFIED"]),
		scenario: z.string().trim().min(1).max(120),
		possible_competitor: z.boolean(),
	}),
	scores: z.object({
		evidence_quality: score,
		commercial_opportunity: score,
		contact_priority: score,
		contact_readiness: score,
	}),
	digital_presence: z.object({
		owned_website: z.boolean(),
		website_accessible: z.boolean(),
		instagram: z.boolean(),
		tiktok: z.boolean(),
		facebook: z.boolean(),
		pagespeed_mobile: z.number().min(0).max(1).nullable(),
		forms: z.number().int().min(0).max(100),
		booking_links: z.number().int().min(0).max(100),
		whatsapp_links: z.number().int().min(0).max(100),
	}),
	commercial_assessment: z.object({
		problem: text,
		recommended_offer: z.string().trim().min(1).max(120),
		offer_code: z.string().trim().min(1).max(120).optional(),
		why_this_offer: text,
		implementation_plan: z.array(text).min(1).max(12),
		price_guidance: text,
		recommended_channel: z.string().trim().min(1).max(120),
		call_opener: text.optional(),
		discovery_questions: z.array(text).max(12).optional(),
		objection_handling: z
			.array(z.object({ objection: text, response: text }))
			.max(12)
			.optional(),
	}),
	evidence: z
		.array(
			z.object({
				claim: text,
				source: z.string().url().max(2048),
				strength: score,
			}),
		)
		.max(12),
	missing_evidence: z.array(z.string().trim().min(1).max(160)).max(20),
	guardrails: z.array(text).max(12),
});

export default defineTool({
	description:
		"Save a structured Lead OS commercial dossier for a company. Use only after reading its CRM history and observed evidence. This never approves a lead, creates outreach, or overwrites a human review decision.",
	inputSchema: z.object({
		companyId: z.string(),
		dossier: dossierSchema,
	}),
	async execute({ companyId, dossier }, ctx) {
		assertResearchPurpose(ctx);

		const company = await db.company.findUnique({
			where: { id: companyId },
			select: { id: true, description: true },
		});
		if (!company) return { saved: false as const, reason: "No such company." };

		const description = replaceDossier(company.description, dossier);
		await db.company.update({
			where: { id: companyId },
			data: { description },
		});

		return {
			saved: true as const,
			status: dossier.classification.status,
			scores: dossier.scores,
			recommendedOffer: dossier.commercial_assessment.recommended_offer,
			note: "Saved for human review only. No outreach or approval was performed.",
		};
	},
});

function replaceDossier(
	description: string | null,
	dossier: z.infer<typeof dossierSchema>,
): string {
	const lines = (description ?? "").split("\n");
	const withoutPriorDossier = lines.filter(
		(line) => !line.startsWith("Dossier Lead OS: "),
	);
	withoutPriorDossier.push(`Dossier Lead OS: ${JSON.stringify(dossier)}`);
	return withoutPriorDossier.filter(Boolean).join("\n");
}
