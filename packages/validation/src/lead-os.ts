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

export function parseLeadScores(
	description: string | null | undefined,
): LeadScores | null {
	const raw = lineValue(description, LEAD_OS_LABELS.dossier);
	if (!raw) return null;
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}
	const parsed = dossierScores.safeParse(json);
	if (!parsed.success) return null;
	return {
		evidence: parsed.data.scores.evidence_quality,
		opportunity: parsed.data.scores.commercial_opportunity,
		priority: parsed.data.scores.contact_priority,
	};
}
