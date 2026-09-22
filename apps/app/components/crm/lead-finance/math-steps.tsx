import {
	type FinanceAssumptions,
	type FinanceScores,
	LEAD_FINANCE,
	type LeadProjection,
} from "@crm/validation";
import { formatDecimal, formatMoney, formatPercent } from "./format";

export function MathSteps({
	scores,
	assumptions,
	projection,
}: {
	scores: FinanceScores;
	assumptions: FinanceAssumptions;
	projection: LeadProjection;
}) {
	const { commercialOpportunity, contactPriority } = LEAD_FINANCE.weights;
	const money = (amount: number) => formatMoney(amount, assumptions.currency);
	const breakEven = projection.breakEvenProbability;

	return (
		<div className="flex flex-col gap-2 rounded-md border p-3">
			<p className="font-medium text-sm">Cálculo paso a paso</p>
			<ol className="flex list-decimal flex-col gap-2 pl-4 text-sm">
				<li>
					<span className="font-medium">Probabilidad de cierre (P)</span>
					<p className="font-mono text-muted-foreground text-xs">
						P = {formatDecimal(commercialOpportunity)} × ({scores.opportunity} ÷
						100) + {formatDecimal(contactPriority)} × ({scores.priority} ÷ 100)
						= {formatDecimal(projection.closeProbability)} (
						{formatPercent(projection.closeProbability)})
					</p>
				</li>
				<li>
					<span className="font-medium">Valor esperado (VE)</span>
					<p className="font-mono text-muted-foreground text-xs">
						VE = P × V − C = {formatDecimal(projection.closeProbability)} ×{" "}
						{money(projection.dealValue)} − {money(projection.costPerContact)} ={" "}
						{money(projection.expectedValue)}
					</p>
				</li>
				<li>
					<span className="font-medium">Probabilidad de equilibrio (P*)</span>
					<p className="font-mono text-muted-foreground text-xs">
						{breakEven === null
							? "P* no se define: el valor de cierre es 0."
							: `P* = C ÷ V = ${money(projection.costPerContact)} ÷ ${money(projection.dealValue)} = ${formatPercent(breakEven)}`}
					</p>
					{breakEven !== null ? (
						<p className="text-muted-foreground text-xs">
							{projection.closeProbability >= breakEven
								? "La probabilidad de este lead supera el equilibrio: el contacto se paga solo, en valor esperado."
								: "La probabilidad de este lead no alcanza el equilibrio: en valor esperado el contacto cuesta más de lo que retorna."}
						</p>
					) : null}
				</li>
			</ol>
			<p className="text-muted-foreground text-xs">
				La probabilidad es una heurística: {commercialOpportunity * 100} % del
				puntaje de oportunidad comercial y {contactPriority * 100} % del de
				prioridad de contacto. No está calibrada con cierres históricos. V, C y
				la tasa son supuestos que puedes editar.
			</p>
		</div>
	);
}
