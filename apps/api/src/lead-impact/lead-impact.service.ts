import { ActivityType, type Db } from "@crm/db";
import {
	LEAD_OS_LABELS,
	parseLeadEvidence,
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

const MINUTE_MS = 60_000;

function ratio(part: number, whole: number): number {
	return whole > 0 ? part / whole : 0;
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[middle] ?? null;
	const low = sorted[middle - 1];
	const high = sorted[middle];
	return low === undefined || high === undefined ? null : (low + high) / 2;
}

function reviewerOf(meta: unknown): string | null {
	if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
		return null;
	}
	const value = (meta as Record<string, unknown>).reviewer;
	return typeof value === "string" && value.trim() ? value.trim() : null;
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
		const reviewNotes = {
			type: ActivityType.NOTE,
			subject: { startsWith: REVIEW_NOTE_PREFIX },
		};

		const [total, approved, rejected, synthetic, notes, rows] =
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
				this.db.activity.findMany({
					where: reviewNotes,
					select: {
						createdAt: true,
						body: true,
						meta: true,
						company: { select: { createdAt: true } },
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
		const documented = notes.filter((note) => note.body?.trim()).length;

		const waits: number[] = [];
		const reviewers = new Set<string>();
		for (const note of notes) {
			const reviewer = reviewerOf(note.meta);
			if (reviewer) reviewers.add(reviewer);
			const arrived = note.company?.createdAt;
			if (!arrived) continue;
			const minutes =
				(note.createdAt.getTime() - arrived.getTime()) / MINUTE_MS;
			if (minutes >= 0) waits.push(minutes);
		}

		let leadsWithEvidence = 0;
		let evidenceItems = 0;
		const companies: LeadImpactCompany[] = rows.map((row) => {
			const review = parseLeadReview(row.description);
			const evidence = parseLeadEvidence(row.description);
			if (evidence && evidence.items.length > 0) {
				leadsWithEvidence += 1;
				evidenceItems += evidence.items.length;
			}
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

		const { manualResearchMinutesPerLead, humanReviewMinutesPerLead } =
			LEAD_IMPACT.assumptions;

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
			measured: {
				decisions: notes.length,
				medianMinutesToDecide: median(waits),
				fastestMinutesToDecide: waits.length ? Math.min(...waits) : null,
				slowestMinutesToDecide: waits.length ? Math.max(...waits) : null,
				leadsWithEvidence,
				evidenceItems,
				reviewers: [...reviewers].sort(),
			},
			estimated: {
				manualMinutesPerLead: manualResearchMinutesPerLead,
				reviewMinutesPerLead: humanReviewMinutesPerLead,
				minutesSavedOnReviewed:
					reviewed * (manualResearchMinutesPerLead - humanReviewMinutesPerLead),
			},
			risk: {
				contactsBlocked: total - approved,
				contactsAllowed: approved,
			},
			companies,
		};
	}
}
