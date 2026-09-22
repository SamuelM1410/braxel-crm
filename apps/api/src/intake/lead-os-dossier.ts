import { webUrl } from "@crm/validation";
import { z } from "zod";

const text = z.string().trim().min(1).max(3000);

export const leadOsDossierSchema = z.object({
	version: z.string().trim().max(80),
	generated_at: z.string().trim().max(80),
	classification: z.object({
		status: z.string().trim().max(80),
		scenario: z.string().trim().max(120),
		possible_competitor: z.boolean(),
	}),
	scores: z.object({
		evidence_quality: z.number().min(0).max(100),
		commercial_opportunity: z.number().min(0).max(100),
		contact_priority: z.number().min(0).max(100),
		contact_readiness: z.number().min(0).max(100),
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
		implementation_plan: z.array(text).max(12),
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
				source: webUrl,
				strength: z.number().min(0).max(100),
			}),
		)
		.max(12),
	missing_evidence: z.array(z.string().trim().min(1).max(160)).max(20),
	guardrails: z.array(text).max(12),
});

export type LeadOsDossier = z.infer<typeof leadOsDossierSchema>;
