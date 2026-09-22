"use client";

import { Button } from "@crm/ui/components/button";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import {
	changeCurrency,
	FINANCE_CURRENCIES,
	type FinanceAssumptions,
	type FinanceCurrency,
	isValidAssumptions,
} from "@crm/validation";

function numberFrom(value: number) {
	return Number.isNaN(value) ? 0 : value;
}

export function AssumptionsForm({
	idPrefix,
	assumptions,
	onChange,
	onReset,
	includePlatformCost = false,
}: {
	idPrefix: string;
	assumptions: FinanceAssumptions;
	onChange: (next: FinanceAssumptions) => void;
	onReset: () => void;
	includePlatformCost?: boolean;
}) {
	const step = assumptions.currency === "USD" ? 0.01 : 1000;
	const valid = isValidAssumptions(assumptions);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<Field className="w-auto">
					<FieldLabel>Moneda</FieldLabel>
					<ToggleGroup
						type="single"
						variant="outline"
						size="sm"
						value={assumptions.currency}
						onValueChange={(value) => {
							if (value)
								onChange(changeCurrency(assumptions, value as FinanceCurrency));
						}}
					>
						{FINANCE_CURRENCIES.map((currency) => (
							<ToggleGroupItem
								key={currency}
								value={currency}
								aria-label={`Ver en ${currency}`}
							>
								{currency}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</Field>
				<Button size="sm" variant="ghost" onClick={onReset}>
					Restablecer supuestos
				</Button>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Field>
					<FieldLabel htmlFor={`${idPrefix}-deal`}>
						Valor de cierre ({assumptions.currency})
					</FieldLabel>
					<Input
						id={`${idPrefix}-deal`}
						type="number"
						inputMode="decimal"
						min={0}
						step={step}
						value={assumptions.dealValue}
						onChange={(event) =>
							onChange({
								...assumptions,
								dealValue: numberFrom(event.target.valueAsNumber),
							})
						}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor={`${idPrefix}-cost`}>
						Costo por contacto ({assumptions.currency})
					</FieldLabel>
					<Input
						id={`${idPrefix}-cost`}
						type="number"
						inputMode="decimal"
						min={0}
						step={step}
						value={assumptions.costPerContact}
						onChange={(event) =>
							onChange({
								...assumptions,
								costPerContact: numberFrom(event.target.valueAsNumber),
							})
						}
					/>
				</Field>
				{includePlatformCost ? (
					<Field>
						<FieldLabel htmlFor={`${idPrefix}-platform`}>
							Costo mensual de la plataforma ({assumptions.currency})
						</FieldLabel>
						<Input
							id={`${idPrefix}-platform`}
							type="number"
							inputMode="decimal"
							min={0}
							step={step}
							value={assumptions.platformMonthlyCost}
							onChange={(event) =>
								onChange({
									...assumptions,
									platformMonthlyCost: numberFrom(event.target.valueAsNumber),
								})
							}
						/>
					</Field>
				) : null}
				<Field>
					<FieldLabel htmlFor={`${idPrefix}-rate`}>COP por 1 USD</FieldLabel>
					<Input
						id={`${idPrefix}-rate`}
						type="number"
						inputMode="decimal"
						min={0}
						step={10}
						value={assumptions.copPerUsd}
						onChange={(event) =>
							onChange({
								...assumptions,
								copPerUsd: numberFrom(event.target.valueAsNumber),
							})
						}
					/>
				</Field>
			</div>
			<p
				className="text-muted-foreground text-xs"
				role={valid ? undefined : "alert"}
			>
				{valid
					? "La tasa es un supuesto editable, no una cotización en vivo. Los montos se convierten con ella al cambiar de moneda."
					: "Revisa los valores: los montos deben ser números desde 0 y la tasa debe ser mayor que 0."}
			</p>
		</div>
	);
}
