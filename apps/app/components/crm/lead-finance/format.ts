import type { FinanceCurrency } from "@crm/validation";

const MONEY: Record<FinanceCurrency, Intl.NumberFormat> = {
	COP: new Intl.NumberFormat("es-CO", {
		style: "currency",
		currency: "COP",
		currencyDisplay: "code",
		maximumFractionDigits: 0,
	}),
	USD: new Intl.NumberFormat("es-CO", {
		style: "currency",
		currency: "USD",
		currencyDisplay: "code",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}),
};

const PERCENT = new Intl.NumberFormat("es-CO", {
	style: "percent",
	minimumFractionDigits: 1,
	maximumFractionDigits: 2,
});

const DECIMAL = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

export function formatMoney(amount: number, currency: FinanceCurrency) {
	return MONEY[currency].format(amount);
}

export function formatPercent(value: number) {
	return PERCENT.format(value);
}

export function formatDecimal(value: number) {
	return DECIMAL.format(value);
}
