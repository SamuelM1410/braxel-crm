import type { LeadScores, ReviewStatus } from "@crm/validation";

export type LeadImpactCompany = {
	id: string;
	name: string;
	industry: string | null;
	city: string | null;
	status: ReviewStatus | null;
	stage: string | null;
	reviewedBy: string | null;
	reason: string | null;
	scores: LeadScores | null;
	contactAllowed: boolean;
	synthetic: boolean;
};

export type LeadImpactSummary = {
	totals: {
		leads: number;
		reviewed: number;
		approved: number;
		rejected: number;
		pending: number;
		synthetic: number;
		documentedDecisions: number;
	};
	rates: {
		coverage: number;
		rejection: number;
		documentation: number;
	};
	/** Measured from the rows themselves. No assumption goes in here. */
	measured: {
		decisions: number;
		medianMinutesToDecide: number | null;
		fastestMinutesToDecide: number | null;
		slowestMinutesToDecide: number | null;
		leadsWithEvidence: number;
		evidenceItems: number;
		reviewers: string[];
	};
	/** Derived from the two editable minute assumptions. Never measured. */
	estimated: {
		manualMinutesPerLead: number;
		reviewMinutesPerLead: number;
		minutesSavedOnReviewed: number;
	};
	risk: {
		contactsBlocked: number;
		contactsAllowed: number;
	};
	companies: LeadImpactCompany[];
};
