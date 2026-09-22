import { z } from "zod";

export const FINANCE_CURRENCIES = ["COP", "USD"] as const;

export type FinanceCurrency = (typeof FINANCE_CURRENCIES)[number];

export const LEAD_FINANCE = {
	currencies: FINANCE_CURRENCIES,
	defaultCurrency: "COP",
	defaults: {
		dealValueCop: 3_000_000,
		costPerContactCop: 25_000,
		platformMonthlyCostCop: 1_000_000,
		copPerUsd: 4_000,
	},
	weights: {
		commercialOpportunity: 0.6,
		contactPriority: 0.4,
	},
	limits: {
		maxAmountCop: 1_000_000_000_000,
		maxCopPerUsd: 100_000,
		usdDecimals: 2,
		copDecimals: 0,
	},
	scenarios: [
		{
			id: "conservative",
			label: "Conservador",
			probabilityFactor: 0.7,
			dealValueFactor: 0.8,
		},
		{ id: "base", label: "Base", probabilityFactor: 1, dealValueFactor: 1 },
		{
			id: "optimistic",
			label: "Optimista",
			probabilityFactor: 1.15,
			dealValueFactor: 1.2,
		},
	],
} as const;

export type FinanceScenario = (typeof LEAD_FINANCE.scenarios)[number];

export type ScenarioFactors = {
	probabilityFactor: number;
	dealValueFactor: number;
};

export const financeAssumptions = z.object({
	currency: z.enum(FINANCE_CURRENCIES),
	dealValue: z.number().finite().min(0),
	costPerContact: z.number().finite().min(0),
	platformMonthlyCost: z.number().finite().min(0),
	copPerUsd: z
		.number()
		.finite()
		.positive()
		.max(LEAD_FINANCE.limits.maxCopPerUsd),
});

export type FinanceAssumptions = z.infer<typeof financeAssumptions>;

export type FinanceScores = {
	opportunity: number;
	priority: number;
};

export type LeadProjection = {
	closeProbability: number;
	dealValue: number;
	costPerContact: number;
	expectedValue: number;
	breakEvenProbability: number | null;
};

export type PortfolioProjection = {
	leads: number;
	averageProbability: number;
	totalExpectedValue: number;
	averageExpectedValue: number;
	platformMonthlyCost: number;
	netMonthlyValue: number;
	leadsToBreakEven: number | null;
	coverage: number;
};

function decimalsOf(currency: FinanceCurrency): number {
	return currency === "USD"
		? LEAD_FINANCE.limits.usdDecimals
		: LEAD_FINANCE.limits.copDecimals;
}

export function roundMoney(amount: number, currency: FinanceCurrency): number {
	const factor = 10 ** decimalsOf(currency);
	return Math.round(amount * factor) / factor;
}

export function convertMoney(
	amount: number,
	from: FinanceCurrency,
	to: FinanceCurrency,
	copPerUsd: number,
): number {
	if (from === to) return amount;
	if (from === "USD") return roundMoney(amount * copPerUsd, "COP");
	return roundMoney(amount / copPerUsd, "USD");
}

export function defaultAssumptions(
	currency: FinanceCurrency = LEAD_FINANCE.defaultCurrency,
): FinanceAssumptions {
	const { copPerUsd, dealValueCop, costPerContactCop, platformMonthlyCostCop } =
		LEAD_FINANCE.defaults;
	const inCurrency = (cop: number) =>
		convertMoney(cop, "COP", currency, copPerUsd);
	return {
		currency,
		dealValue: inCurrency(dealValueCop),
		costPerContact: inCurrency(costPerContactCop),
		platformMonthlyCost: inCurrency(platformMonthlyCostCop),
		copPerUsd,
	};
}

export function changeCurrency(
	assumptions: FinanceAssumptions,
	to: FinanceCurrency,
): FinanceAssumptions {
	if (assumptions.currency === to) return assumptions;
	const convert = (amount: number) =>
		convertMoney(amount, assumptions.currency, to, assumptions.copPerUsd);
	return {
		...assumptions,
		currency: to,
		dealValue: convert(assumptions.dealValue),
		costPerContact: convert(assumptions.costPerContact),
		platformMonthlyCost: convert(assumptions.platformMonthlyCost),
	};
}

export function isValidAssumptions(assumptions: FinanceAssumptions): boolean {
	if (!financeAssumptions.safeParse(assumptions).success) return false;
	const toCop = (amount: number) =>
		convertMoney(amount, assumptions.currency, "COP", assumptions.copPerUsd);
	return [
		assumptions.dealValue,
		assumptions.costPerContact,
		assumptions.platformMonthlyCost,
	].every((amount) => toCop(amount) <= LEAD_FINANCE.limits.maxAmountCop);
}

export function closeProbability(scores: FinanceScores): number {
	const { commercialOpportunity, contactPriority } = LEAD_FINANCE.weights;
	const value =
		(scores.opportunity / 100) * commercialOpportunity +
		(scores.priority / 100) * contactPriority;
	return Math.min(1, Math.max(0, value));
}

export function expectedValue(
	probability: number,
	dealValue: number,
	costPerContact: number,
): number {
	return probability * dealValue - costPerContact;
}

export function breakEvenProbability(
	dealValue: number,
	costPerContact: number,
): number | null {
	if (dealValue <= 0) return null;
	return costPerContact / dealValue;
}

export function leadsToBreakEven(
	platformMonthlyCost: number,
	averageExpectedValue: number,
): number | null {
	if (averageExpectedValue <= 0) return null;
	return Math.ceil(platformMonthlyCost / averageExpectedValue);
}

export function projectLead(
	scores: FinanceScores,
	assumptions: FinanceAssumptions,
): LeadProjection {
	const probability = closeProbability(scores);
	return {
		closeProbability: probability,
		dealValue: assumptions.dealValue,
		costPerContact: assumptions.costPerContact,
		expectedValue: expectedValue(
			probability,
			assumptions.dealValue,
			assumptions.costPerContact,
		),
		breakEvenProbability: breakEvenProbability(
			assumptions.dealValue,
			assumptions.costPerContact,
		),
	};
}

export function projectPortfolio(
	leads: FinanceScores[],
	assumptions: FinanceAssumptions,
	scenario: ScenarioFactors = { probabilityFactor: 1, dealValueFactor: 1 },
): PortfolioProjection {
	const dealValue = assumptions.dealValue * scenario.dealValueFactor;
	let totalProbability = 0;
	let totalExpectedValue = 0;
	for (const lead of leads) {
		const probability = Math.min(
			1,
			closeProbability(lead) * scenario.probabilityFactor,
		);
		totalProbability += probability;
		totalExpectedValue += expectedValue(
			probability,
			dealValue,
			assumptions.costPerContact,
		);
	}
	const count = leads.length;
	const averageExpectedValue = count > 0 ? totalExpectedValue / count : 0;
	return {
		leads: count,
		averageProbability: count > 0 ? totalProbability / count : 0,
		totalExpectedValue,
		averageExpectedValue,
		platformMonthlyCost: assumptions.platformMonthlyCost,
		netMonthlyValue: totalExpectedValue - assumptions.platformMonthlyCost,
		leadsToBreakEven: leadsToBreakEven(
			assumptions.platformMonthlyCost,
			averageExpectedValue,
		),
		coverage:
			assumptions.platformMonthlyCost > 0
				? totalExpectedValue / assumptions.platformMonthlyCost
				: 0,
	};
}
