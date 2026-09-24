"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatGroup } from "@crm/ui/components/dashboard";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import {
	isValidAssumptions,
	LEAD_FINANCE,
	projectLead,
	projectPortfolio,
} from "@crm/validation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AssumptionsForm } from "@/components/crm/lead-finance/assumptions-form";
import {
	formatDecimal,
	formatMoney,
	formatPercent,
} from "@/components/crm/lead-finance/format";
import { useFinanceAssumptions } from "@/components/crm/lead-finance/use-finance-assumptions";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const STATUS_LABEL = {
	PENDING: "Pendiente",
	APPROVED: "Aprobado",
	REJECTED: "Rechazado",
} as const;

export function LeadFinanceDashboard() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const { assumptions, update, reset } = useFinanceAssumptions();
	const query = useQuery(trpc.leadFinance.portfolio.queryOptions());

	if (query.isError) {
		return (
			<Alert variant="destructive">
				<AlertTitle>No se pudo cargar el portafolio</AlertTitle>
				<AlertDescription>
					{query.error.message}
					<Button
						className="mt-2"
						size="sm"
						variant="outline"
						onClick={() => void query.refetch()}
					>
						Reintentar
					</Button>
				</AlertDescription>
			</Alert>
		);
	}

	const portfolio = query.data;
	if (!portfolio) return null;

	if (portfolio.leads.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Todavía no hay leads con dossier</EmptyTitle>
					<EmptyDescription>
						Carga los datos sintéticos con bun run db:seed:hackathon o pide una
						evaluación Lead OS a Eve en una empresa.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const currency = assumptions.currency;
	const money = (amount: number) => formatMoney(amount, currency);
	const valid = isValidAssumptions(assumptions);
	const counted = portfolio.leads.filter((lead) => lead.status !== "REJECTED");
	const rejected = portfolio.leads.length - counted.length;
	const scores = counted.map((lead) => lead.scores);
	const base = valid ? projectPortfolio(scores, assumptions) : null;
	const sustainable =
		base !== null &&
		base.leadsToBreakEven !== null &&
		base.leads >= base.leadsToBreakEven;

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Supuestos</CardTitle>
					<CardDescription>
						Todo el panel se recalcula al editar. Los valores se guardan en este
						navegador y también se usan en cada lead.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<AssumptionsForm
						idPrefix="lead-finance-portfolio"
						assumptions={assumptions}
						onChange={update}
						onReset={reset}
						includePlatformCost
					/>
				</CardContent>
			</Card>

			{base ? (
				<>
					<StatGroup>
						<StatCard
							label="Leads que cuentan"
							value={base.leads}
							description={
								[
									rejected > 0
										? `${rejected} rechazado${rejected === 1 ? "" : "s"} por una persona: nunca se contactará, así que su valor esperado es 0 y no suma.`
										: null,
									portfolio.leadsWithoutScores > 0
										? `${portfolio.leadsWithoutScores} más tienen un dossier sin puntajes válidos y no se cuentan.`
										: null,
								]
									.filter(Boolean)
									.join(" ") || undefined
							}
						/>
						<StatCard
							label="Valor esperado total"
							value={money(base.totalExpectedValue)}
							description={`Promedio por lead: ${money(base.averageExpectedValue)}`}
						/>
						<StatCard
							label="Costo mensual de la plataforma"
							value={money(base.platformMonthlyCost)}
							description={`El valor esperado cubre ${formatPercent(base.coverage)} de ese costo.`}
						/>
						<StatCard
							label="Punto de equilibrio"
							value={
								base.leadsToBreakEven === null
									? "—"
									: `${base.leadsToBreakEven} ${base.leadsToBreakEven === 1 ? "lead" : "leads"}`
							}
							delta={
								base.leadsToBreakEven === null
									? { value: "No alcanza", direction: "down" }
									: {
											value: sustainable ? "Sostenible" : "Falta volumen",
											direction: sustainable ? "up" : "down",
										}
							}
							description={
								base.leadsToBreakEven === null
									? "El valor esperado por lead es 0 o negativo: más leads no cubren el costo."
									: `Leads contactados por mes para cubrir la plataforma. Hoy hay ${base.leads}.`
							}
						/>
					</StatGroup>

					<Card>
						<CardHeader>
							<CardTitle>Escenarios en {currency}</CardTitle>
							<CardDescription>
								Cada escenario multiplica la probabilidad de cierre (con tope de
								100 %) y el valor de cierre. El costo por contacto no cambia.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Escenario</TableHead>
										<TableHead>Probabilidad promedio</TableHead>
										<TableHead>Valor de cierre</TableHead>
										<TableHead>Valor esperado total</TableHead>
										<TableHead>Neto mensual</TableHead>
										<TableHead>Leads para equilibrio</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{LEAD_FINANCE.scenarios.map((scenario) => {
										const projection = projectPortfolio(
											scores,
											assumptions,
											scenario,
										);
										return (
											<TableRow key={scenario.id}>
												<TableCell>
													<span className="font-medium">{scenario.label}</span>
													<p className="text-muted-foreground text-xs">
														P × {formatDecimal(scenario.probabilityFactor)} · V
														× {formatDecimal(scenario.dealValueFactor)}
													</p>
												</TableCell>
												<TableCell className="tabular-nums">
													{formatPercent(projection.averageProbability)}
												</TableCell>
												<TableCell className="tabular-nums">
													{money(
														assumptions.dealValue * scenario.dealValueFactor,
													)}
												</TableCell>
												<TableCell className="tabular-nums">
													{money(projection.totalExpectedValue)}
												</TableCell>
												<TableCell className="tabular-nums">
													{money(projection.netMonthlyValue)}
												</TableCell>
												<TableCell className="tabular-nums">
													{projection.leadsToBreakEven ?? "—"}
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Cómo se calcula, para verificarlo</CardTitle>
							<CardDescription>
								Cada fila de la tabla siguiente se puede recalcular a mano con
								estas fórmulas.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
								<li>
									Probabilidad de cierre: P ={" "}
									{formatDecimal(LEAD_FINANCE.weights.commercialOpportunity)} ×
									(oportunidad ÷ 100) +{" "}
									{formatDecimal(LEAD_FINANCE.weights.contactPriority)} ×
									(prioridad ÷ 100).
								</li>
								<li>Valor esperado por lead: VE = P × V − C.</li>
								<li>Probabilidad de equilibrio de un contacto: P* = C ÷ V.</li>
								<li>
									Leads para equilibrio = redondeo hacia arriba de (costo
									mensual de la plataforma ÷ VE promedio). Con estos supuestos:{" "}
									{base.leadsToBreakEven === null
										? "no existe, porque el VE promedio es 0 o negativo."
										: `${money(base.platformMonthlyCost)} ÷ ${money(base.averageExpectedValue)} = ${base.leadsToBreakEven}.`}
								</li>
							</ul>
							<p className="text-muted-foreground text-xs">
								V es el valor de cierre, C el costo por contacto. La
								probabilidad es una heurística sobre los puntajes del dossier,
								no un modelo entrenado con cierres reales. Los montos son
								supuestos editables.
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Leads incluidos</CardTitle>
							<CardDescription>
								{portfolio.truncated
									? "Se muestran los leads más recientes; la lista está limitada."
									: "Todos los leads con dossier válido. Un lead rechazado aparece, pero no suma al portafolio."}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Empresa</TableHead>
										<TableHead>Oportunidad / Prioridad</TableHead>
										<TableHead>Probabilidad</TableHead>
										<TableHead>Valor esperado</TableHead>
										<TableHead>Decisión humana</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{portfolio.leads.map((lead) => {
										const projection = projectLead(lead.scores, assumptions);
										return (
											<TableRow key={lead.id}>
												<TableCell>
													<Link
														className="font-medium underline-offset-2 hover:underline"
														href={workspaceUrl(`/companies/${lead.id}`)}
													>
														{lead.name}
													</Link>
												</TableCell>
												<TableCell className="tabular-nums">
													{lead.scores.opportunity} / {lead.scores.priority}
												</TableCell>
												<TableCell className="tabular-nums">
													{formatPercent(projection.closeProbability)}
												</TableCell>
												<TableCell className="tabular-nums">
													{lead.status === "REJECTED"
														? "No suma: rechazado"
														: money(projection.expectedValue)}
												</TableCell>
												<TableCell>
													<Badge
														variant={
															lead.status === "REJECTED"
																? "destructive"
																: lead.status === "APPROVED"
																	? "default"
																	: "secondary"
														}
													>
														{STATUS_LABEL[lead.status ?? "PENDING"]}
													</Badge>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</>
			) : null}
		</div>
	);
}
