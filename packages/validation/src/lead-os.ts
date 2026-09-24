import { z } from "zod";

export const LEAD_OS_LABELS = {
	source: "Lead OS source",
	stage: "Etapa Lead OS",
	review: "Revisión",
	doNotContact: "No contactar",
	reviewedBy: "Revisado por",
	reviewReason: "Motivo de revisión",
	synthetic: "Datos sintéticos",
	dossier: "Dossier Lead OS",
} as const;

export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const reviewStatus = z.enum(REVIEW_STATUSES);

const affirmative = new Set(["sí", "si", "yes", "true"]);

function isYes(value: string | null): boolean {
	return affirmative.has((value ?? "").toLowerCase());
}

const dossierScores = z.object({
	scores: z.object({
		evidence_quality: z.number().min(0).max(100),
		commercial_opportunity: z.number().min(0).max(100),
		contact_priority: z.number().min(0).max(100),
	}),
});

const dossierEvidence = z.object({
	generated_at: z.string().trim().min(1).optional(),
	evidence: z
		.array(
			z.object({
				claim: z.string().trim().min(1),
				source: z.string().trim().min(1),
				strength: z.number().min(0).max(100),
			}),
		)
		.default([]),
	missing_evidence: z.array(z.string().trim().min(1)).default([]),
});

export type LeadReview = {
	isLead: boolean;
	stage: string | null;
	status: ReviewStatus | null;
	doNotContact: boolean;
	reviewedBy: string | null;
	reason: string | null;
	synthetic: boolean;
	contactAllowed: boolean;
};

export type LeadScores = {
	evidence: number;
	opportunity: number;
	priority: number;
};

export type LeadEvidenceItem = {
	claim: string;
	source: string;
	strength: number;
};

export type LeadEvidence = {
	generatedAt: string | null;
	items: LeadEvidenceItem[];
	missing: string[];
};

export function lineValue(
	description: string | null | undefined,
	label: string,
): string | null {
	if (!description) return null;
	const prefix = `${label}:`;
	for (const line of description.split("\n")) {
		if (line.startsWith(prefix))
			return line.slice(prefix.length).trim() || null;
	}
	return null;
}

export function parseLeadReview(
	description: string | null | undefined,
): LeadReview {
	const parsedStatus = reviewStatus.safeParse(
		lineValue(description, LEAD_OS_LABELS.review),
	);
	const status = parsedStatus.success ? parsedStatus.data : null;
	const doNotContact = isYes(
		lineValue(description, LEAD_OS_LABELS.doNotContact),
	);
	const decided = status === "APPROVED" || status === "REJECTED";
	return {
		isLead: lineValue(description, LEAD_OS_LABELS.source) !== null,
		stage: lineValue(description, LEAD_OS_LABELS.stage),
		status,
		doNotContact,
		reviewedBy: decided
			? lineValue(description, LEAD_OS_LABELS.reviewedBy)
			: null,
		reason: decided
			? lineValue(description, LEAD_OS_LABELS.reviewReason)
			: null,
		synthetic: isYes(lineValue(description, LEAD_OS_LABELS.synthetic)),
		contactAllowed: status === "APPROVED" && !doNotContact,
	};
}

function dossierJson(description: string | null | undefined): unknown {
	const raw = lineValue(description, LEAD_OS_LABELS.dossier);
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export function parseLeadScores(
	description: string | null | undefined,
): LeadScores | null {
	const json = dossierJson(description);
	if (json === null) return null;
	const parsed = dossierScores.safeParse(json);
	if (!parsed.success) return null;
	return {
		evidence: parsed.data.scores.evidence_quality,
		opportunity: parsed.data.scores.commercial_opportunity,
		priority: parsed.data.scores.contact_priority,
	};
}

export function parseLeadEvidence(
	description: string | null | undefined,
): LeadEvidence | null {
	const json = dossierJson(description);
	if (json === null) return null;
	const parsed = dossierEvidence.safeParse(json);
	if (!parsed.success) return null;
	return {
		generatedAt: parsed.data.generated_at ?? null,
		items: parsed.data.evidence,
		missing: parsed.data.missing_evidence,
	};
}
