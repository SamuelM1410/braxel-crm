"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Separator } from "@crm/ui/components/separator";

type Evidence = { claim: string; source: string; strength: number };
type Dossier = {
	classification: { status: string; scenario: string };
	scores: {
		evidence_quality: number;
		commercial_opportunity: number;
		contact_priority: number;
	};
	digital_presence: {
		owned_website: boolean;
		website_accessible: boolean;
		instagram: boolean;
		tiktok: boolean;
		facebook: boolean;
		pagespeed_mobile: number | null;
		forms: number;
		booking_links: number;
		whatsapp_links: number;
	};
	commercial_assessment: {
		problem: string;
		recommended_offer: string;
		implementation_plan: string[];
		price_guidance: string;
		call_opener?: string;
		discovery_questions?: string[];
		objection_handling?: { objection: string; response: string }[];
	};
	evidence: Evidence[];
	missing_evidence: string[];
	guardrails: string[];
};

type ContactChannels = {
	website: string | null;
	phone: string | null;
	email: string | null;
	whatsappUrl: string | null;
	instagramUrl: string | null;
	facebookUrl: string | null;
	tiktokUrl: string | null;
	linkedinUrl: string | null;
};

export function LeadDossierPanel({
	description,
	channels,
}: {
	description: string | null;
	channels: ContactChannels;
}) {
	const dossier = parseDossier(description);
	if (!dossier) return null;
	const assessment = completeAssessment(dossier);
	const contact = recommendedContact(channels);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Plan comercial del lead</CardTitle>
				<CardDescription>
					Diagnóstico basado en evidencia. Revisión humana obligatoria antes de
					contactar.
				</CardDescription>
				<CardAction>
					<Badge variant="secondary">{dossier.classification.status}</Badge>
				</CardAction>
			</CardHeader>
			<CardContent>
				<div className="grid gap-3 sm:grid-cols-3">
					<Score label="Evidence" value={dossier.scores.evidence_quality} />
					<Score
						label="Opportunity"
						value={dossier.scores.commercial_opportunity}
					/>
					<Score label="Priority" value={dossier.scores.contact_priority} />
				</div>
				<Separator />
				<div className="flex flex-col gap-1">
					<p className="font-medium text-sm">
						1. Diagnóstico y oferta recomendada
					</p>
					<p className="text-sm">{assessment.recommended_offer}</p>
					<p className="text-muted-foreground text-sm">{assessment.problem}</p>
					<p className="text-muted-foreground text-sm">
						Escenario: {dossier.classification.scenario}
					</p>
					<p className="font-medium text-sm">
						Rango sugerido: {assessment.price_guidance}
					</p>
				</div>
				<DossierList
					title="2. Plan de implementación"
					values={assessment.implementation_plan}
				/>
				<div className="rounded-md border p-3">
					<p className="font-medium text-sm">3. Canal y siguiente acción</p>
					<p className="mt-1 text-sm">{contact.reason}</p>
					<p className="mt-1 text-muted-foreground text-sm">
						{contact.nextAction}
					</p>
					{contact.href ? (
						<Button asChild className="mt-3" size="sm" variant="outline">
							<a
								href={contact.href}
								target={contact.external ? "_blank" : undefined}
								rel={contact.external ? "noreferrer noopener" : undefined}
							>
								Abrir {contact.label}
							</a>
						</Button>
					) : null}
				</div>
				{assessment.call_opener ? (
					<div className="flex flex-col gap-1">
						<p className="font-medium text-sm">4. Apertura sugerida</p>
						<p className="text-muted-foreground text-sm">
							{assessment.call_opener}
						</p>
					</div>
				) : null}
				<DossierList
					title="5. Preguntas de descubrimiento"
					values={assessment.discovery_questions ?? []}
				/>
				{assessment.objection_handling?.length ? (
					<div className="flex flex-col gap-2">
						<p className="font-medium text-sm">6. Objeciones probables</p>
						{assessment.objection_handling.map((item) => (
							<div
								key={item.objection}
								className="rounded-md border p-3 text-sm"
							>
								<p className="font-medium">{item.objection}</p>
								<p className="text-muted-foreground">{item.response}</p>
							</div>
						))}
					</div>
				) : null}
				<DossierList
					title="7. Información que falta confirmar"
					values={
						dossier.missing_evidence.length
							? dossier.missing_evidence
							: [
									"Confirmar con el prospecto los datos operativos que no son públicos antes de cotizar.",
								]
					}
				/>
				<div className="flex flex-col gap-1">
					<p className="font-medium text-sm">8. Presencia observada</p>
					<p className="text-muted-foreground text-sm">
						{presenceSummary(dossier.digital_presence)}
					</p>
				</div>
				{dossier.evidence.length > 0 ? (
					<div className="flex flex-col gap-2">
						<p className="font-medium text-sm">9. Evidencia verificable</p>
						{dossier.evidence.map((item) => (
							<a
								key={`${item.claim}-${item.source}`}
								href={item.source}
								target="_blank"
								rel="noreferrer noopener"
								className="text-muted-foreground text-sm underline-offset-2 hover:underline"
							>
								{item.claim} · {item.strength}/100
							</a>
						))}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function recommendedContact(channels: ContactChannels) {
	if (channels.whatsappUrl)
		return {
			label: "WhatsApp",
			href: channels.whatsappUrl,
			external: true,
			reason:
				"WhatsApp fue encontrado como canal comercial público. Verifica que sea el número correcto y que el contacto sea apropiado.",
			nextAction:
				"Revisa el dossier y aprueba manualmente el primer mensaje antes de enviarlo.",
		};
	if (channels.phone)
		return {
			label: "llamada",
			href: `tel:${channels.phone}`,
			external: false,
			reason:
				"Hay teléfono público disponible; una llamada humana es el canal prioritario cuando el lead tiene alta prioridad.",
			nextAction:
				"Prepara la apertura sugerida y llama solo después de validar responsable y horario.",
		};
	if (channels.instagramUrl)
		return {
			label: "Instagram",
			href: channels.instagramUrl,
			external: true,
			reason:
				"Instagram fue encontrado como presencia comercial pública, pero no confirma que un DM sea el canal preferido.",
			nextAction:
				"Revisa el perfil, confirma actividad comercial y aprueba manualmente un DM breve si procede.",
		};
	if (channels.facebookUrl)
		return {
			label: "Facebook",
			href: channels.facebookUrl,
			external: true,
			reason:
				"Facebook fue encontrado como presencia comercial pública. Falta verificar quién administra la página.",
			nextAction:
				"Valida actividad y responsable antes de iniciar una conversación.",
		};
	if (channels.linkedinUrl)
		return {
			label: "LinkedIn",
			href: channels.linkedinUrl,
			external: true,
			reason:
				"LinkedIn es útil para confirmar empresa o responsable, aunque no garantiza una respuesta.",
			nextAction:
				"Confirma el decisor y prepara una nota personalizada para aprobación humana.",
		};
	if (channels.email)
		return {
			label: "email",
			href: `mailto:${channels.email}`,
			external: false,
			reason:
				"Solo hay email público; es una ruta secundaria si no existe teléfono o canal comercial más directo.",
			nextAction:
				"Revisa y aprueba el correo personalizado; no usar secuencias automáticas sin política de entregabilidad.",
		};
	if (channels.tiktokUrl)
		return {
			label: "TikTok",
			href: channels.tiktokUrl,
			external: true,
			reason:
				"TikTok evidencia presencia comercial, pero normalmente no es el primer canal de cierre B2B.",
			nextAction:
				"Úsalo para investigar oferta y actividad; busca un canal directo antes de contactar.",
		};
	if (channels.website)
		return {
			label: "sitio web",
			href: channels.website,
			external: true,
			reason:
				"No se encontró un canal directo. El sitio oficial puede contener página de contacto, formulario, WhatsApp o un teléfono que aún no fue confirmado.",
			nextAction:
				"Revisa Contacto, Nosotros y el footer del sitio; registra cualquier canal público encontrado antes de contactar.",
		};
	return {
		label: "investigación",
		href: null,
		external: false,
		reason: "No hay un canal directo verificado en el CRM.",
		nextAction:
			"Investiga sitio oficial, Google Business o responsable antes de intentar contacto.",
	};
}

function completeAssessment(
	dossier: Dossier,
): Dossier["commercial_assessment"] {
	const assessment = dossier.commercial_assessment;
	const offer = offerLabel(assessment.recommended_offer);
	return {
		...assessment,
		recommended_offer: offer,
		call_opener:
			assessment.call_opener ||
			`Hola, estuve revisando la presencia pública de la empresa y encontré una oportunidad concreta: ${assessment.problem.replace(/[.!?]+$/, "").toLowerCase()}. Quisiera entender cómo gestionan hoy esa parte antes de sugerirles ${offer.toLowerCase()}.`,
		discovery_questions: assessment.discovery_questions?.length
			? assessment.discovery_questions
			: [
					"¿Cómo llegan hoy sus consultas, solicitudes o ventas?",
					"¿Qué ocurre desde que entra una oportunidad hasta que alguien la atiende?",
					"¿Dónde sienten que se pierden más oportunidades actualmente?",
					"¿Qué resultado tendría que producir una solución nueva para justificar la inversión?",
				],
		objection_handling: assessment.objection_handling?.length
			? assessment.objection_handling
			: [
					{
						objection: "Ya tenemos página o presencia digital",
						response:
							"La propuesta no parte de reemplazar lo que funciona, sino de corregir el punto de conversión o seguimiento que la evidencia sugiere. Primero confirmaremos si ese problema existe.",
					},
					{
						objection: "Ahora no es una prioridad",
						response:
							"Entiendo. Conviene confirmar cuánto impacto tiene hoy el problema y en qué momento tendría sentido revisarlo, sin forzar una decisión.",
					},
					{
						objection: "Envíame información",
						response:
							"Enviar un diagnóstico breve con la evidencia observada, la hipótesis de mejora y el siguiente paso; nunca una propuesta genérica ni un envío automático sin aprobación humana.",
					},
				],
	};
}

function offerLabel(value: string) {
	const labels: Record<string, string> = {
		WEB_SOCIAL_CONVERSION: "Web de conversión + WhatsApp + catálogo",
		STARTER_WEB: "Web comercial de conversión",
		FULL_GROWTH_SYSTEM: "Sistema completo de captación, CRM y seguimiento",
		CONVERSION_WEB: "Rediseño web orientado a conversión",
		APPOINTMENT_SYSTEM: "Sistema de agenda y seguimiento",
		AUTOMATION_CRM: "Automatización de leads + CRM",
		NO_CONTACT_NOW: "No contactar por ahora",
		RESEARCH_MORE: "Investigar antes de contactar",
	};
	return labels[value] ?? value;
}

export function descriptionWithoutLeadDossier(description: string | null) {
	return (
		description
			?.split("\n")
			.filter((line) => !line.startsWith("Dossier Lead OS: "))
			.join("\n")
			.trim() || null
	);
}

function Score({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="font-medium tabular-nums text-sm">{value}/100</p>
		</div>
	);
}

function DossierList({ title, values }: { title: string; values: string[] }) {
	if (values.length === 0) return null;
	return (
		<div className="flex flex-col gap-1">
			<p className="font-medium text-sm">{title}</p>
			<ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground text-sm">
				{values.map((value) => (
					<li key={value}>{value}</li>
				))}
			</ul>
		</div>
	);
}

function presenceSummary(presence: Dossier["digital_presence"]) {
	const channels = [
		presence.owned_website ? "owned website" : "no owned website",
		presence.instagram ? "Instagram" : null,
		presence.tiktok ? "TikTok" : null,
		presence.facebook ? "Facebook" : null,
		presence.whatsapp_links > 0 ? "WhatsApp" : null,
		presence.booking_links > 0 ? "booking" : null,
		presence.forms > 0 ? "forms" : null,
	].filter(Boolean);
	return channels.join(" · ");
}

function parseDossier(description: string | null): Dossier | null {
	const line = description
		?.split("\n")
		.find((value) => value.startsWith("Dossier Lead OS: "));
	if (!line) return legacyDossier(description);
	try {
		const value = JSON.parse(line.slice("Dossier Lead OS: ".length));
		if (!isDossier(value)) return null;
		return value;
	} catch {
		return null;
	}
}

function legacyDossier(description: string | null): Dossier | null {
	if (!description?.includes("Lead OS source:")) return null;
	const value = (label: string) =>
		description.match(new RegExp(`^${label}:\\s*(.+)$`, "m"))?.[1]?.trim() ??
		"";
	const score = Number(value("Score").match(/\\d+/)?.[0] ?? 0);
	const pain = value("Dolor") || "Pendiente de investigación";
	const research = value("Investigación");
	const evidence = value("Evidencia");
	return {
		classification: {
			status: value("Etapa Lead OS") || "REVIEW_REQUIRED",
			scenario: "Lead legado: pendiente de reprocesamiento v9",
		},
		scores: {
			evidence_quality: score,
			commercial_opportunity: score,
			contact_priority: score,
		},
		digital_presence: {
			owned_website: Boolean(evidence),
			website_accessible: Boolean(evidence),
			instagram: false,
			tiktok: false,
			facebook: false,
			pagespeed_mobile: null,
			forms: 0,
			booking_links: 0,
			whatsapp_links: 0,
		},
		commercial_assessment: {
			problem: pain,
			recommended_offer: "Sistema de captación y seguimiento de leads",
			implementation_plan: research
				.split("→")
				.map((item) => item.trim())
				.filter(Boolean),
			price_guidance:
				"Definir después de confirmar volumen de leads, proceso actual y prioridad comercial.",
		},
		evidence: evidence
			? [
					{
						claim: "Sitio o fuente detectada",
						source: evidence.split(",")[0]?.trim() ?? evidence,
						strength: score,
					},
				]
			: [],
		missing_evidence: [
			"Este lead usa el formato anterior. Se actualizará con la investigación v9.",
		],
		guardrails: [],
	};
}

function isDossier(value: unknown): value is Dossier {
	if (!value || typeof value !== "object") return false;
	const data = value as Record<string, unknown>;
	const scores = data.scores as Record<string, unknown> | undefined;
	const assessment = data.commercial_assessment as
		| Record<string, unknown>
		| undefined;
	return Boolean(
		data.classification &&
			scores &&
			assessment &&
			typeof scores.evidence_quality === "number" &&
			typeof scores.commercial_opportunity === "number" &&
			typeof scores.contact_priority === "number" &&
			typeof assessment.recommended_offer === "string",
	);
}
