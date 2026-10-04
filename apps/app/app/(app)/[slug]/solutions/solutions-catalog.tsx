"use client";

import Application from "@carbon/icons-react/es/Application";
import Calendar from "@carbon/icons-react/es/Calendar";
import type { CarbonIconType } from "@carbon/icons-react/es/CarbonIcon";
import ChartLineData from "@carbon/icons-react/es/ChartLineData";
import Email from "@carbon/icons-react/es/Email";
import InventoryManagement from "@carbon/icons-react/es/InventoryManagement";
import Search from "@carbon/icons-react/es/Search";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Separator } from "@crm/ui/components/separator";
import Link from "next/link";
import { useState } from "react";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Solution = {
	id: string;
	title: string;
	icon: CarbonIconType;
	short: string;
	idealFor: string;
	scope: string[];
	inputs: string;
	output: string;
	complexity: "Sencillo" | "Intermedio";
};

const SOLUTIONS: Solution[] = [
	{
		id: "research",
		title: "Investigador de empresas",
		icon: Search,
		short:
			"Convierte una web en un diagnóstico y una siguiente acción comercial.",
		idealFor: "Cualquier empresa con presencia digital.",
		scope: [
			"Analizar web pública con ScrapeGraph",
			"Validar email, teléfono, WhatsApp y redes",
			"Recomendar canal y generar un borrador",
		],
		inputs: "URL o empresa ya guardada en el CRM",
		output: "Dossier comercial con evidencia y canal recomendado",
		complexity: "Sencillo",
	},
	{
		id: "conversion",
		title: "Auditoría web y conversión",
		icon: ChartLineData,
		short: "Detecta qué está frenando contactos, ventas o solicitudes.",
		idealFor: "Negocios con web, catálogo o landing existente.",
		scope: [
			"Revisar propuesta, navegación y llamadas a la acción",
			"Detectar formularios o canales faltantes",
			"Entregar prioridades de mejora y ejemplo de solución",
		],
		inputs: "Sitio web público",
		output: "Informe priorizado con cambios concretos",
		complexity: "Sencillo",
	},
	{
		id: "commerce",
		title: "E-commerce y WhatsApp",
		icon: Email,
		short: "Ayuda a recuperar oportunidades de compra y responder mejor.",
		idealFor: "Tiendas online con consultas o carritos abandonados.",
		scope: [
			"Capturar eventos de carrito o consulta",
			"Preparar mensajes contextuales",
			"Registrar respuestas y escalar casos sensibles",
		],
		inputs: "Tienda, webhook o exportación de pedidos",
		output: "Flujo de seguimiento con aprobación y métricas",
		complexity: "Intermedio",
	},
	{
		id: "booking",
		title: "Reservas y recordatorios",
		icon: Calendar,
		short: "Organiza solicitudes, citas y confirmaciones en un solo flujo.",
		idealFor: "Clínicas, salones, consultores y servicios locales.",
		scope: [
			"Formulario o entrada desde correo",
			"Calendario y estados de confirmación",
			"Recordatorios y lista de pendientes",
		],
		inputs: "Disponibilidad y reglas del negocio",
		output: "Agenda operativa con seguimiento",
		complexity: "Sencillo",
	},
	{
		id: "operations",
		title: "Panel operativo",
		icon: InventoryManagement,
		short: "Un tablero simple para pedidos, entregas, inventario o estados.",
		idealFor: "Empresas que hoy trabajan con hojas y muchos mensajes.",
		scope: [
			"Estados y responsables",
			"Filtros, métricas y alertas básicas",
			"Importación CSV o conexión con una API existente",
		],
		inputs: "CSV, formulario o API del cliente",
		output: "Vista operativa específica para el proceso elegido",
		complexity: "Intermedio",
	},
];

export function SolutionsCatalog() {
	const workspaceUrl = useWorkspaceUrl();
	const [selectedId, setSelectedId] = useState(SOLUTIONS[0]?.id ?? "");
	const selected = SOLUTIONS.find((solution) => solution.id === selectedId);

	return (
		<div className="flex flex-col gap-6">
			<div className="rounded-lg border bg-muted/30 p-4 text-sm">
				<div className="flex items-start gap-3">
					<Icon icon={Application} className="mt-0.5 text-muted-foreground" />
					<div className="flex flex-col gap-1">
						<p className="font-medium">Catálogo para descubrir proyectos</p>
						<p className="text-muted-foreground">
							Estas soluciones son módulos vendibles y acotados. El CRM y el
							scraper siguen siendo herramientas internas de Braxel.
						</p>
					</div>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{SOLUTIONS.map((solution) => {
					const active = selectedId === solution.id;
					return (
						<button
							key={solution.id}
							type="button"
							className="text-left"
							onClick={() => setSelectedId(solution.id)}
						>
							<Card
								className={
									active ? "border-primary ring-1 ring-primary/30" : ""
								}
							>
								<CardHeader>
									<div className="flex items-center justify-between gap-3">
										<Icon
											icon={solution.icon}
											className="text-muted-foreground"
										/>
										<Badge variant="secondary">{solution.complexity}</Badge>
									</div>
									<CardTitle className="text-base">{solution.title}</CardTitle>
									<CardDescription>{solution.short}</CardDescription>
								</CardHeader>
								<CardContent className="text-muted-foreground text-xs">
									Ideal para: {solution.idealFor}
								</CardContent>
							</Card>
						</button>
					);
				})}
			</div>

			{selected ? (
				<Card>
					<CardHeader>
						<CardTitle>Plan inicial: {selected.title}</CardTitle>
						<CardDescription>
							Un alcance que Codex puede construir, probar y entregar por
							etapas.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="grid gap-4 text-sm md:grid-cols-3">
							<div>
								<p className="font-medium">Entrada</p>
								<p className="text-muted-foreground">{selected.inputs}</p>
							</div>
							<div>
								<p className="font-medium">Entrega</p>
								<p className="text-muted-foreground">{selected.output}</p>
							</div>
							<div>
								<p className="font-medium">Cliente ideal</p>
								<p className="text-muted-foreground">{selected.idealFor}</p>
							</div>
						</div>
						<Separator />
						<div>
							<p className="mb-2 font-medium text-sm">Alcance mínimo</p>
							<ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
								{selected.scope.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button asChild size="sm">
								<Link href={workspaceUrl("/companies")}>
									Elegir una empresa
								</Link>
							</Button>
							<Button asChild size="sm" variant="outline">
								<Link href={workspaceUrl("/leads")}>Investigar un lead</Link>
							</Button>
						</div>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
