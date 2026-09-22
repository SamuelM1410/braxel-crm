import { ActivityType, type Db } from "@crm/db";
import {
	LEAD_OS_LABELS,
	parseLeadReview,
	parseLeadScores,
} from "@crm/validation";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { LEAD_IMPACT } from "./lead-impact.config";
import type {
	LeadImpactCompany,
	LeadImpactSummary,
} from "./lead-impact.contracts";

const REVIEW_NOTE_PREFIX = "Lead review:";

function ratio(part: number, whole: number): number {
	return whole > 0 ? part / whole : 0;
}

@Injectable()
export class LeadImpactService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async summary(): Promise<LeadImpactSummary> {
		const leads = {
			description: { startsWith: `${LEAD_OS_LABELS.source}:` },
		};
		const line = (label: string, value: string) => ({
			AND: [leads, { description: { contains: `\n${label}: ${value}` } }],
		});

		const [total, approved, rejected, synthetic, documented, rows] =
			await Promise.all([
				this.db.company.count({ where: leads }),
				this.db.company.count({
					where: line(LEAD_OS_LABELS.review, "APPROVED"),
				}),
				this.db.company.count({
					where: line(LEAD_OS_LABELS.review, "REJECTED"),
				}),
				this.db.company.count({
					where: line(LEAD_OS_LABELS.synthetic, "sí"),
				}),
				this.db.activity.count({
					where: {
						type: ActivityType.NOTE,
						subject: { startsWith: REVIEW_NOTE_PREFIX },
						body: { not: null },
					},
				}),
				this.db.company.findMany({
					where: leads,
					orderBy: { updatedAt: "desc" },
					take: LEAD_IMPACT.table.maxRows,
					select: {
						id: true,
						name: true,
						industry: true,
						city: true,
						description: true,
					},
				}),
			]);

		const reviewed = approved + rejected;
		const pending = total - reviewed;
		const { manualResearchMinutesPerLead, humanReviewMinutesPerLead } =
			LEAD_IMPACT.assumptions;
		const companies: LeadImpactCompany[] = rows.map((row) => {
			const review = parseLeadReview(row.description);
			return {
				id: row.id,
				name: row.name,
				industry: row.industry,
				city: row.city,
				status: review.status,
				stage: review.stage,
				reviewedBy: review.reviewedBy,
				reason: review.reason,
				scores: parseLeadScores(row.description),
				contactAllowed: review.contactAllowed,
				synthetic: review.synthetic,
			};
		});

		return {
			totals: {
				leads: total,
				reviewed,
				approved,
				rejected,
				pending,
				synthetic,
				documentedDecisions: Math.min(documented, reviewed),
			},
			rates: {
				coverage: ratio(reviewed, total),
				rejection: ratio(rejected, reviewed),
				documentation: ratio(Math.min(documented, reviewed), reviewed),
			},
			time: {
				manualMinutesPerLead: manualResearchMinutesPerLead,
				reviewMinutesPerLead: humanReviewMinutesPerLead,
				minutesSaved:
					total * (manualResearchMinutesPerLead - humanReviewMinutesPerLead),
			},
			risk: {
				contactsBlocked: total - approved,
				contactsAllowed: approved,
			},
			companies,
		};
	}
}
