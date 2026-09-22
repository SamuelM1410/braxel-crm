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
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { IMPACT_COPY } from "./impact-config";

const NUMBER = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const PERCENT = new Intl.NumberFormat("es-CO", {
	style: "percent",
	maximumFractionDigits: 0,
});

const STATUS_LABEL = {
	PENDING: "Pendiente",
	APPROVED: "Aprobado",
	REJECTED: "Rechazado",
} as const;

export function ImpactDashboard() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const query = useQuery(trpc.leadImpact.summary.queryOptions());
	const summary = query.data;

	if (query.isError) {
		return (
			<Alert variant="destructive">
				<AlertTitle>No se pudo cargar el impacto</AlertTitle>
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

	if (!summary) return null;

	const { totals, rates, time, risk, companies } = summary;

	if (totals.leads === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Todavía no hay leads de Lead OS</EmptyTitle>
					<EmptyDescription>
						Carga los datos sintéticos con bun run db:seed:hackathon o importa
						leads por el endpoint de intake.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const hoursSaved = time.minutesSaved / 60;

	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				<StatCard
					label="Leads revisados"
					value={`${totals.reviewed} de ${totals.leads}`}
					description={`${PERCENT.format(rates.coverage)} del total tiene una decisión humana. ${totals.pending} esperan revisión.`}
				/>
				<StatCard
					label="Tiempo ahorrado (estimado)"
					value={`${NUMBER.format(hoursSaved)} h`}
					description={`${totals.leads} leads × (${time.manualMinutesPerLead} − ${time.reviewMinutesPerLead}) min. Supuesto, no medición.`}
				/>
				<StatCard
					label="Contactos bloqueados"
					value={risk.contactsBlocked}
					description={`${risk.contactsAllowed} de ${totals.leads} leads tienen el canal habilitado, todos con aprobación humana.`}
				/>
				<StatCard
					label="Leads descartados"
					value={totals.rejected}
					description={`${PERCENT.format(rates.rejection)} de las decisiones fue un rechazo.`}
				/>
			</StatGroup>

			<Card>
				<CardHeader>
					<CardTitle>Riesgo reducido por la revisión humana</CardTitle>
					<CardDescription>
						Datos calculados sobre los leads guardados en el CRM.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
						<li>
							{totals.rejected} lead
							{totals.rejected === 1 ? "" : "s"} descartado
							{totals.rejected === 1 ? "" : "s"} por una persona antes de
							cualquier contacto.
						</li>
						<li>
							{totals.documentedDecisions} de {totals.reviewed} decisiones
							tienen motivo e historial ({PERCENT.format(rates.documentation)}).
						</li>
						<li>
							{risk.contactsBlocked} de {totals.leads} leads tienen el canal
							bloqueado en este momento.
						</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Cómo se evita contactar sin autorización</CardTitle>
					<CardDescription>
						Cada punto corresponde a código de esta rama.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ol className="flex list-decimal flex-col gap-1 pl-4 text-sm">
						{IMPACT_COPY.guardrails.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ol>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Arquitectura y escalabilidad</CardTitle>
					<CardDescription>
						Del lead público al contacto autorizado.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-3 md:grid-cols-5">
						{IMPACT_COPY.pipeline.map((step) => (
							<div key={step.title} className="rounded-md border p-3">
								<p className="font-medium text-sm">{step.title}</p>
								<p className="mt-1 text-muted-foreground text-xs">
									{step.text}
								</p>
							</div>
						))}
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="flex flex-col gap-1">
							<p className="font-medium text-sm">Por qué escala</p>
							<ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground text-sm">
								{IMPACT_COPY.scales.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</div>
						<div className="flex flex-col gap-1">
							<p className="font-medium text-sm">Límites conocidos</p>
							<ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground text-sm">
								{IMPACT_COPY.limits.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Demo con varias empresas</CardTitle>
					<CardDescription>
						{totals.synthetic > 0
							? `${totals.synthetic} empresas son datos sintéticos: no representan negocios reales y no deben contactarse.`
							: "Leads de Lead OS guardados en el CRM."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Empresa</TableHead>
								<TableHead>E / O / P</TableHead>
								<TableHead>Decisión humana</TableHead>
								<TableHead>Motivo</TableHead>
								<TableHead>Canal</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{companies.map((company) => (
								<TableRow key={company.id}>
									<TableCell>
										<Link
											className="font-medium underline-offset-2 hover:underline"
											href={workspaceUrl(`/companies/${company.id}`)}
										>
											{company.name}
										</Link>
										<p className="text-muted-foreground text-xs">
											{[company.city, company.industry]
												.filter(Boolean)
												.join(" · ")}
										</p>
									</TableCell>
									<TableCell className="tabular-nums">
										{company.scores
											? `${company.scores.evidence} / ${company.scores.opportunity} / ${company.scores.priority}`
											: "—"}
									</TableCell>
									<TableCell>
										<Badge
											variant={
												company.status === "REJECTED"
													? "destructive"
													: company.status === "APPROVED"
														? "default"
														: "secondary"
											}
										>
											{STATUS_LABEL[company.status ?? "PENDING"]}
										</Badge>
										{company.reviewedBy ? (
											<p className="mt-1 text-muted-foreground text-xs">
												{company.reviewedBy}
											</p>
										) : null}
									</TableCell>
									<TableCell className="max-w-72 whitespace-normal text-muted-foreground text-xs">
										{company.reason ?? "Sin decisión todavía"}
									</TableCell>
									<TableCell>
										<Badge variant="outline">
											{company.contactAllowed ? "Habilitado" : "Bloqueado"}
										</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
