import type { ZodType, z } from "zod";
import * as agents from "./agents";
import * as leadReview from "./lead-review";
import * as slack from "./slack";

export const schemas = { agents, leadReview, slack } as const;

export type {
	Handoff,
	HandoffChannel,
	InputOption,
	InputRequest,
	InputRequested,
	Permission,
} from "./agents";
export type {
	FinanceAssumptions,
	FinanceCurrency,
	FinanceScenario,
	FinanceScores,
	LeadProjection,
	PortfolioProjection,
	ScenarioFactors,
} from "./lead-finance";
export {
	breakEvenProbability,
	changeCurrency,
	closeProbability,
	convertMoney,
	defaultAssumptions,
	expectedValue,
	FINANCE_CURRENCIES,
	financeAssumptions,
	isValidAssumptions,
	LEAD_FINANCE,
	leadsToBreakEven,
	projectLead,
	projectPortfolio,
	roundMoney,
} from "./lead-finance";
export type {
	ContactLock,
	LeadEvidence,
	LeadEvidenceItem,
	LeadReview,
	LeadScores,
	ReviewStatus,
} from "./lead-os";
export {
	contactLockOf,
	LEAD_OS_LABELS,
	lineValue,
	parseLeadEvidence,
	parseLeadReview,
	parseLeadScores,
	REVIEW_STATUSES,
} from "./lead-os";
export { LEAD_REVIEW } from "./lead-review";
export type { AuthTest, Installation, JoinPayload, Reply } from "./slack";
export {
	isWebUrl,
	MAX_URL_LENGTH,
	safeHref,
	WEB_URL_SCHEMES,
	webUrl,
} from "./web-url";

export class InvalidInput extends Error {
	override readonly name = "InvalidInput";
}

export function parse<Schema extends ZodType>(
	schema: Schema,
	value: unknown,
	subject: string,
): z.infer<Schema> {
	const result = schema.safeParse(value);

	if (!result.success) {
		throw new InvalidInput(
			`${subject}: ${result.error.issues
				.map((issue) =>
					issue.path.length > 0
						? `${issue.path.join(".")} ${issue.message}`
						: issue.message,
				)
				.join("; ")}`,
		);
	}

	return result.data;
}
