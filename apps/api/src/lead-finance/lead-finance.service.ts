import { type Db } from "@crm/db";
import {
	LEAD_OS_LABELS,
	parseLeadReview,
	parseLeadScores,
} from "@crm/validation";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { LEAD_FINANCE_API } from "./lead-finance.config";
import type {
	LeadFinanceLead,
	LeadFinancePortfolio,
} from "./lead-finance.contracts";

@Injectable()
export class LeadFinanceService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async portfolio(): Promise<LeadFinancePortfolio> {
		const rows = await this.db.company.findMany({
			where: { description: { contains: `\n${LEAD_OS_LABELS.dossier}: ` } },
			orderBy: { updatedAt: "desc" },
			take: LEAD_FINANCE_API.portfolio.maxLeads + 1,
			select: { id: true, name: true, description: true },
		});

		const leads: LeadFinanceLead[] = [];
		let leadsWithoutScores = 0;
		for (const row of rows.slice(0, LEAD_FINANCE_API.portfolio.maxLeads)) {
			const scores = parseLeadScores(row.description);
			if (!scores) {
				leadsWithoutScores += 1;
				continue;
			}
			const review = parseLeadReview(row.description);
			leads.push({
				id: row.id,
				name: row.name,
				status: review.status,
				scores: { opportunity: scores.opportunity, priority: scores.priority },
				synthetic: review.synthetic,
			});
		}

		return {
			leads,
			leadsWithoutScores,
			truncated: rows.length > LEAD_FINANCE_API.portfolio.maxLeads,
		};
	}
}
