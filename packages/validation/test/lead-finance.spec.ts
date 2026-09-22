import { describe, expect, it } from "bun:test";
import {
	breakEvenProbability,
	changeCurrency,
	closeProbability,
	convertMoney,
	defaultAssumptions,
	expectedValue,
	isValidAssumptions,
	LEAD_FINANCE,
	leadsToBreakEven,
	projectLead,
	projectPortfolio,
} from "../src/index";

const assumptions = defaultAssumptions("COP");

describe("close probability", () => {
	it("weights opportunity at 60 % and priority at 40 %", () => {
		expect(closeProbability({ opportunity: 74, priority: 88 })).toBeCloseTo(
			0.796,
			10,
		);
	});

	it("stays between 0 and 1", () => {
		expect(closeProbability({ opportunity: 0, priority: 0 })).toBe(0);
		expect(closeProbability({ opportunity: 100, priority: 100 })).toBe(1);
		expect(closeProbability({ opportunity: 900, priority: 900 })).toBe(1);
		expect(closeProbability({ opportunity: -50, priority: -50 })).toBe(0);
	});
});

describe("expected value and break-even", () => {
	it("is probability times deal value minus the cost of the contact", () => {
		expect(expectedValue(0.796, 3_000_000, 25_000)).toBeCloseTo(2_363_000, 4);
		expect(expectedValue(0, 3_000_000, 25_000)).toBe(-25_000);
	});

	it("finds the probability at which a contact pays for itself", () => {
		expect(breakEvenProbability(3_000_000, 25_000)).toBeCloseTo(1 / 120, 10);
		expect(breakEvenProbability(0, 25_000)).toBeNull();
		const p = breakEvenProbability(3_000_000, 25_000) ?? 0;
		expect(expectedValue(p, 3_000_000, 25_000)).toBeCloseTo(0, 6);
	});

	it("needs a positive average value to reach the platform break-even", () => {
		expect(leadsToBreakEven(1_000_000, 2_363_000)).toBe(1);
		expect(leadsToBreakEven(1_000_000, 300_000)).toBe(4);
		expect(leadsToBreakEven(1_000_000, 0)).toBeNull();
		expect(leadsToBreakEven(1_000_000, -10)).toBeNull();
	});
});

describe("currencies", () => {
	it("converts COP to USD and back with the editable rate", () => {
		expect(convertMoney(3_000_000, "COP", "USD", 4_000)).toBe(750);
		expect(convertMoney(750, "USD", "COP", 4_000)).toBe(3_000_000);
		expect(convertMoney(25_000, "COP", "USD", 4_000)).toBe(6.25);
		expect(convertMoney(5, "COP", "COP", 4_000)).toBe(5);
	});

	it("starts in COP and derives the USD defaults from the same numbers", () => {
		expect(assumptions.currency).toBe("COP");
		expect(assumptions.dealValue).toBe(LEAD_FINANCE.defaults.dealValueCop);
		const usd = defaultAssumptions("USD");
		expect(usd.dealValue).toBe(750);
		expect(usd.costPerContact).toBe(6.25);
		expect(usd.platformMonthlyCost).toBe(250);
	});

	it("keeps the amounts equivalent when the currency changes", () => {
		const usd = changeCurrency(assumptions, "USD");
		expect(usd.dealValue).toBe(750);
		expect(changeCurrency(usd, "COP")).toEqual(assumptions);
	});
});

describe("assumption validation", () => {
	it("accepts the defaults", () => {
		expect(isValidAssumptions(assumptions)).toBe(true);
		expect(isValidAssumptions(defaultAssumptions("USD"))).toBe(true);
	});

	it("refuses negative money, a zero rate and absurd amounts", () => {
		expect(isValidAssumptions({ ...assumptions, dealValue: -1 })).toBe(false);
		expect(isValidAssumptions({ ...assumptions, costPerContact: -1 })).toBe(
			false,
		);
		expect(isValidAssumptions({ ...assumptions, copPerUsd: 0 })).toBe(false);
		expect(isValidAssumptions({ ...assumptions, dealValue: Number.NaN })).toBe(
			false,
		);
		expect(
			isValidAssumptions({
				...assumptions,
				dealValue: LEAD_FINANCE.limits.maxAmountCop * 2,
			}),
		).toBe(false);
	});
});

describe("projecting a lead", () => {
	it("returns the numbers a person can verify by hand", () => {
		const projection = projectLead(
			{ opportunity: 74, priority: 88 },
			assumptions,
		);
		expect(projection.closeProbability).toBeCloseTo(0.796, 10);
		expect(projection.expectedValue).toBeCloseTo(2_363_000, 4);
		expect(projection.breakEvenProbability).toBeCloseTo(25_000 / 3_000_000, 10);
	});

	it("gives a negative value when the probability is below break-even", () => {
		const projection = projectLead(
			{ opportunity: 0, priority: 0 },
			assumptions,
		);
		expect(projection.expectedValue).toBe(-25_000);
	});
});

describe("projecting the portfolio", () => {
	const leads = [
		{ opportunity: 74, priority: 88 },
		{ opportunity: 81, priority: 79 },
		{ opportunity: 38, priority: 31 },
	];

	it("sums each lead's expected value", () => {
		const total = leads
			.map((lead) => projectLead(lead, assumptions).expectedValue)
			.reduce((sum, value) => sum + value, 0);
		const portfolio = projectPortfolio(leads, assumptions);
		expect(portfolio.leads).toBe(3);
		expect(portfolio.totalExpectedValue).toBeCloseTo(total, 4);
		expect(portfolio.averageExpectedValue).toBeCloseTo(total / 3, 4);
		expect(portfolio.netMonthlyValue).toBeCloseTo(
			total - assumptions.platformMonthlyCost,
			4,
		);
		expect(portfolio.coverage).toBeCloseTo(
			total / assumptions.platformMonthlyCost,
			6,
		);
	});

	it("reports the leads needed to cover the platform", () => {
		const portfolio = projectPortfolio(leads, assumptions);
		expect(portfolio.leadsToBreakEven).toBe(
			Math.ceil(
				assumptions.platformMonthlyCost / portfolio.averageExpectedValue,
			),
		);
	});

	it("moves the total between scenarios in the expected direction", () => {
		const [conservative, base, optimistic] = LEAD_FINANCE.scenarios.map(
			(scenario) => projectPortfolio(leads, assumptions, scenario),
		);
		expect(conservative?.totalExpectedValue ?? 0).toBeLessThan(
			base?.totalExpectedValue ?? 0,
		);
		expect(optimistic?.totalExpectedValue ?? 0).toBeGreaterThan(
			base?.totalExpectedValue ?? 0,
		);
		expect(base?.totalExpectedValue).toBeCloseTo(
			projectPortfolio(leads, assumptions).totalExpectedValue,
			6,
		);
	});

	it("caps a scenario probability at 100 %", () => {
		const optimistic = LEAD_FINANCE.scenarios[2];
		const portfolio = projectPortfolio(
			[{ opportunity: 100, priority: 100 }],
			assumptions,
			optimistic,
		);
		expect(portfolio.averageProbability).toBe(1);
	});

	it("handles an empty portfolio without dividing by zero", () => {
		const portfolio = projectPortfolio([], assumptions);
		expect(portfolio.leads).toBe(0);
		expect(portfolio.averageExpectedValue).toBe(0);
		expect(portfolio.leadsToBreakEven).toBeNull();
		expect(portfolio.averageProbability).toBe(0);
	});

	it("reports no break-even when every lead loses money", () => {
		const portfolio = projectPortfolio(
			[{ opportunity: 0, priority: 0 }],
			assumptions,
		);
		expect(portfolio.leadsToBreakEven).toBeNull();
	});
});
