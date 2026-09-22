import type { LeadScores, ReviewStatus } from "@crm/validation";

export type LeadFinanceLead = {
	id: string;
	name: string;
	status: ReviewStatus | null;
	scores: Pick<LeadScores, "opportunity" | "priority">;
	synthetic: boolean;
};

export type LeadFinancePortfolio = {
	leads: LeadFinanceLead[];
	leadsWithoutScores: number;
	truncated: boolean;
};
