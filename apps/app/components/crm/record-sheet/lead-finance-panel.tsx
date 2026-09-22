"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Badge } from "@crm/ui/components/badge";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Separator } from "@crm/ui/components/separator";
import {
	isValidAssumptions,
	LEAD_OS_LABELS,
	lineValue,
	parseLeadScores,
	projectLead,
} from "@crm/validation";
import { AssumptionsForm } from "@/components/crm/lead-finance/assumptions-form";
import {
	formatMoney,
	formatPercent,
} from "@/components/crm/lead-finance/format";
import { MathSteps } from "@/components/crm/lead-finance/math-steps";
import { useFinanceAssumptions } from "@/components/crm/lead-finance/use-finance-assumptions";

export function LeadFinancePanel({
	companyId,
	description,
}: {
	companyId: string;
	description: string | null;
}) {
	const { assumptions, update, reset } = useFinanceAssumptions();

	if (lineValue(description, LEAD_OS_LABELS.dossier) === null) return null;

	const scores = parseLeadScores(description);
	if (!scores) {
		return (
			<Alert variant="warning">
				<AlertTitle>Proyección financiera no disponible</AlertTitle>
				<AlertDescription>
					El dossier de este lead no trae puntajes válidos. Vuelve a pedir la
					evaluación a Eve para proyectar su valor esperado.
				</AlertDescription>
			</Alert>
		);
	}

	const valid = isValidAssumptions(assumptions);
	const projection = valid ? projectLead(scores, assumptions) : null;
	const money = (amount: number) => formatMoney(amount, assumptions.currency);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Proyección financiera del lead</CardTitle>
				<CardDescription>
					Estimación a partir de los puntajes del dossier. Cambia el valor de
					cierre y el costo por contacto para simular escenarios.
				</CardDescription>
				{projection ? (
					<CardAction>
						<Badge variant="secondary">
							{formatPercent(projection.closeProbability)} de cierre
						</Badge>
					</CardAction>
				) : null}
			</CardHeader>
			<CardContent>
				<AssumptionsForm
					idPrefix={`lead-finance-${companyId}`}
					assumptions={assumptions}
					onChange={update}
					onReset={reset}
				/>
				<Separator />
				{projection ? (
					<>
						<div className="grid gap-3 sm:grid-cols-4">
							<Metric
								label="Probabilidad de cierre"
								value={formatPercent(projection.closeProbability)}
							/>
							<Metric
								label="Valor esperado"
								value={money(projection.expectedValue)}
							/>
							<Metric
								label="Costo por contacto"
								value={money(projection.costPerContact)}
							/>
							<Metric
								label="Probabilidad de equilibrio"
								value={
									projection.breakEvenProbability === null
										? "—"
										: formatPercent(projection.breakEvenProbability)
								}
							/>
						</div>
						<MathSteps
							scores={scores}
							assumptions={assumptions}
							projection={projection}
						/>
					</>
				) : null}
			</CardContent>
		</Card>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="font-medium text-sm tabular-nums">{value}</p>
		</div>
	);
}
