"use client";

import Application from "@carbon/icons-react/es/Application";
import type { CarbonIconType } from "@carbon/icons-react/es/CarbonIcon";
import ChartLineData from "@carbon/icons-react/es/ChartLineData";
import Email from "@carbon/icons-react/es/Email";
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

const VIDEO_REFERENCES = [
	{
		title: "Funnel de +6 cifras",
		url: "https://www.youtube.com/watch?v=0iJ8jOhJxnA&t=14s",
		lesson: "Oferta concreta, etapas medibles y un cuello de botella por vez.",
	},
	{
		title: "Empresa AI-first",
		url: "https://www.youtube.com/watch?v=AL7KyOfq4MQ&t=2s",
		lesson:
			"Centralizar contexto y automatizar tareas repetitivas sin vender el CRM.",
	},
	{
		title: "Vender webs sin llamar",
		url: "https://www.youtube.com/watch?v=vGfIOPIkogg&t=23s",
		lesson:
			"Mostrar una evidencia específica antes de presentar una propuesta.",
	},
	{
		title: "Hacer webs no es el negocio",
		url: "https://www.youtube.com/watch?v=UXKXNQ3OBj8",
		lesson: "Vender el problema resuelto: captación, reservas o conversión.",
	},
	{
		title: "Oferta B2B high-ticket",
		url: "https://www.youtube.com/watch?v=9_u1LNFsKv0",
		lesson: "Conectar segmento, fuga, mecanismo y resultado verificable.",
	},
] as const;

const SOLUTIONS: Solution[] = [
	{
		id: "websites",
		title: "Páginas web que convierten",
		icon: Search,
		short: "Diseña una web clara, confiable y orientada a generar contactos.",
		idealFor: "Empresas de servicios y negocios con presencia digital.",
		scope: [
			"Arquitectura y contenido orientados al objetivo comercial",
			"Diseño responsive con llamadas a la acción claras",
			"Formularios y canales de contacto medibles",
		],
		inputs: "Objetivo, oferta, audiencia y referencias visuales",
		output: "Página publicada con una ruta clara hacia el contacto",
		complexity: "Sencillo",
	},
	{
		id: "web-apps",
		title: "Aplicaciones web a medida",
		icon: Application,
		short:
			"Convierte procesos repetitivos en una aplicación útil para el negocio.",
		idealFor:
			"Empresas que necesitan una herramienta interna o para sus clientes.",
		scope: [
			"Definir el flujo principal y los roles",
			"Construir pantallas, estados y validaciones",
			"Entregar una primera versión medible y ampliable",
		],
		inputs: "Proceso actual, usuarios y resultado esperado",
		output: "Aplicación web funcional con el flujo prioritario",
		complexity: "Intermedio",
	},
	{
		id: "ecommerce",
		title: "Tienda online",
		icon: Email,
		short: "Construye o mejora una experiencia de compra lista para vender.",
		idealFor: "Marcas que venden productos por internet.",
		scope: [
			"Catálogo, fichas de producto y navegación",
			"Checkout y puntos de confianza",
			"Medición de eventos y oportunidades de mejora",
		],
		inputs: "Catálogo, proceso de pago y objetivos de venta",
		output: "Ecommerce preparado para recibir y medir compras",
		complexity: "Intermedio",
	},
	{
		id: "conversion",
		title: "Rediseño y CRO",
		icon: ChartLineData,
		short: "Mejora claridad, confianza y conversión sin rehacer todo a ciegas.",
		idealFor: "Negocios con una web que recibe visitas pero convierte poco.",
		scope: [
			"Auditar propuesta, recorrido y llamadas a la acción",
			"Priorizar cambios por impacto y esfuerzo",
			"Probar mejoras con medición y aprendizaje",
		],
		inputs: "Sitio actual, analítica disponible y objetivo comercial",
		output: "Plan priorizado y cambios de conversión verificables",
		complexity: "Sencillo",
	},
	{
		id: "ecommerce-retention",
		title: "Recompra y recuperación para ecommerce",
		icon: Email,
		short:
			"Recupera oportunidades y aumenta la recompra con flujos contextuales.",
		idealFor: "Tiendas online con carritos abandonados o clientes inactivos.",
		scope: [
			"Bienvenida, segmentación y recuperación de carritos",
			"Reseñas poscompra y campañas de recompra",
			"Experimentos A/B y métricas de respuesta",
		],
		inputs: "Tienda, eventos de compra y canales autorizados",
		output: "Flujo medible de retención y recuperación de ventas",
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

			<Card>
				<CardHeader>
					<CardTitle>Playbook aplicado: tiendas deportivas</CardTitle>
					<CardDescription>
						Campaña actual para marcas de camisetas y ropa deportiva sin web
						propia. La propuesta se adapta a la evidencia del negocio; no se
						envía nada desde esta pantalla.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 lg:grid-cols-[1fr_1fr]">
					<div className="space-y-2 text-sm">
						<p className="font-medium">Implementación en Braxel</p>
						<ul className="list-disc space-y-1 pl-5 text-muted-foreground">
							<li>
								Priorizar marcas con WhatsApp público y sin dominio propio.
							</li>
							<li>
								Guardar una evidencia concreta: catálogo, checkout, CTA o canal
								de contacto.
							</li>
							<li>
								Ofrecer primero una mejora web/ecommerce; mencionar recompra
								solo si venden online.
							</li>
							<li>
								Medir respuesta, diagnóstico, agenda, propuesta y cierre antes
								de aumentar volumen.
							</li>
						</ul>
					</div>
					<div className="space-y-2 text-sm">
						<p className="font-medium">Videos de referencia</p>
						<div className="space-y-2">
							{VIDEO_REFERENCES.map((video) => (
								<div key={video.url} className="rounded-md border p-2">
									<a
										href={video.url}
										target="_blank"
										rel="noreferrer"
										className="font-medium text-primary underline underline-offset-2"
									>
										{video.title}
									</a>
									<p className="mt-1 text-muted-foreground text-xs">
										{video.lesson}
									</p>
								</div>
							))}
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
