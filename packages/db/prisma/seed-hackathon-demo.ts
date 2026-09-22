import { db } from "../src/client";
import { ActivityType, RecordSource } from "../src/generated/prisma/enums";

const SYNTHETIC_TLD = "invalid";
const REVIEWER_ID = "seed-hackathon-demo-reviewer";
const REVIEWER_NAME = "Revisor Demo (sintético)";
const REVIEW_SUBJECT_PREFIX = "Lead review:";
const DAY_MS = 24 * 60 * 60 * 1000;

type Decision = {
	status: "APPROVED" | "REJECTED";
	reason: string;
	daysAgo: number;
};

type Spec = {
	sourceId: string;
	name: string;
	slug: string;
	city: string;
	industry: string;
	contact: { firstName: string; title: string };
	scores: {
		evidence: number;
		opportunity: number;
		priority: number;
		readiness: number;
	};
	scenario: string;
	competitor: boolean;
	presence: { instagram: boolean; facebook: boolean; whatsapp: boolean };
	problem: string;
	offer: string;
	whyOffer: string;
	plan: string[];
	price: string;
	channel: string;
	opener: string;
	questions: string[];
	evidence: { claim: string; strength: number }[];
	missing: string[];
	decision?: Decision;
};

const SPECS: Spec[] = [
	{
		sourceId: "hackathon-demo-1",
		name: "Panadería Sol y Trigo",
		slug: "sol-y-trigo",
		city: "Bogotá",
		industry: "Panadería / Alimentos",
		contact: { firstName: "Camila", title: "Encargada de redes" },
		scores: { evidence: 82, opportunity: 74, priority: 88, readiness: 70 },
		scenario:
			"Presencia social activa sin sitio propio; WhatsApp ya es el canal real de venta.",
		competitor: false,
		presence: { instagram: true, facebook: true, whatsapp: true },
		problem:
			"Reciben pedidos por WhatsApp e Instagram sin un sistema que centralice la conversación, y en horas pico se pierden confirmaciones y seguimientos.",
		offer: "WEB_SOCIAL_CONVERSION",
		whyOffer:
			"No hay sitio propio, pero sí señales activas de venta por redes y WhatsApp. Consolidar en un catálogo con conversión reduce pedidos perdidos sin rehacer lo que ya funciona.",
		plan: [
			"Levantar catálogo de productos con precios y disponibilidad",
			"Conectar WhatsApp Business API para centralizar los pedidos",
			"Publicar una landing de conversión enlazada desde Instagram y Facebook",
		],
		price:
			"Rango de conversación inicial: 2.5M - 4M COP, a confirmar según volumen real de pedidos.",
		channel: "WhatsApp",
		opener:
			"Hola Camila, vi el catálogo de Sol y Trigo en Instagram y cómo reciben pedidos por WhatsApp. Quisiera entender cómo hacen seguimiento a esos pedidos en horas pico antes de sugerirles algo puntual.",
		questions: [
			"¿Cómo confirman hoy un pedido cuando llegan varios mensajes al tiempo?",
			"¿Qué pasa cuando un cliente escribe y nadie contesta a tiempo?",
			"¿Llevan registro de cuántos pedidos se pierden por falta de respuesta?",
		],
		evidence: [
			{
				claim:
					"Cuenta de Instagram activa con catálogo de productos y pedidos por DM",
				strength: 85,
			},
			{
				claim:
					"Página de Facebook con reseñas de clientes mencionando demoras en respuesta",
				strength: 70,
			},
			{
				claim: "Canal de WhatsApp público usado para tomar pedidos",
				strength: 80,
			},
		],
		missing: [
			"Confirmar volumen mensual real de pedidos",
			"Confirmar quién administra hoy las redes y el WhatsApp",
		],
	},
	{
		sourceId: "hackathon-demo-2",
		name: "Clínica Dental Sonrisa Norte",
		slug: "sonrisa-norte",
		city: "Medellín",
		industry: "Salud / Odontología",
		contact: { firstName: "Andrés", title: "Administrador" },
		scores: { evidence: 78, opportunity: 81, priority: 79, readiness: 66 },
		scenario:
			"Agenda por WhatsApp e Instagram; sin sistema de citas ni recordatorios visibles.",
		competitor: false,
		presence: { instagram: true, facebook: false, whatsapp: true },
		problem:
			"Las citas se agendan por mensajes sueltos y las reseñas mencionan cancelaciones sin aviso, lo que deja horas sin ocupar.",
		offer: "APPOINTMENT_SYSTEM",
		whyOffer:
			"La demanda ya llega por redes. Un sistema de agenda con recordatorios reduce inasistencias sin cambiar el canal que los pacientes ya usan.",
		plan: [
			"Publicar una página de agenda con disponibilidad por especialista",
			"Enviar recordatorios de cita con confirmación por WhatsApp",
			"Medir inasistencias antes y después durante 30 días",
		],
		price:
			"Rango de conversación inicial: 3M - 5M COP, a confirmar según número de especialistas.",
		channel: "WhatsApp",
		opener:
			"Hola Andrés, vi que la clínica agenda por mensajes y que algunas reseñas hablan de citas canceladas sin aviso. Me gustaría entender cómo manejan hoy los recordatorios antes de sugerir algo.",
		questions: [
			"¿Cómo confirman hoy una cita con el paciente?",
			"¿Cuántas citas se pierden al mes por inasistencia?",
			"¿Quién gestiona la agenda cuando hay cambios de última hora?",
		],
		evidence: [
			{
				claim: "Perfil de Instagram con solicitudes de cita en comentarios",
				strength: 78,
			},
			{ claim: "Canal de WhatsApp público para agendar citas", strength: 82 },
		],
		missing: [
			"Confirmar número de especialistas y sedes",
			"Confirmar la tasa real de inasistencia",
		],
	},
	{
		sourceId: "hackathon-demo-3",
		name: "Ferretería Los Andes",
		slug: "ferreteria-los-andes",
		city: "Barranquilla",
		industry: "Comercio / Ferretería",
		contact: { firstName: "Marta", title: "Gerente" },
		scores: { evidence: 61, opportunity: 56, priority: 58, readiness: 52 },
		scenario:
			"Negocio local con catálogo en Facebook y sin canal de cotización en línea.",
		competitor: false,
		presence: { instagram: false, facebook: true, whatsapp: false },
		problem:
			"Los clientes piden cotizaciones por publicaciones de Facebook, sin un canal que registre la solicitud ni el seguimiento.",
		offer: "STARTER_WEB",
		whyOffer:
			"Hay demanda visible pero dispersa. Una web comercial con formulario de cotización centraliza las solicitudes.",
		plan: [
			"Crear una web comercial con catálogo por categorías",
			"Agregar un formulario de cotización con respuesta en 24 horas",
		],
		price:
			"Rango de conversación inicial: 1.8M - 2.8M COP, a confirmar según tamaño del catálogo.",
		channel: "Facebook",
		opener:
			"Hola Marta, vi el catálogo de la ferretería en Facebook y que varios clientes piden precios en los comentarios. Quisiera entender cómo llevan hoy esas cotizaciones.",
		questions: [
			"¿Cómo registran hoy una solicitud de cotización?",
			"¿Qué porcentaje de las cotizaciones termina en venta?",
		],
		evidence: [
			{
				claim: "Página de Facebook con solicitudes de precio sin respuesta",
				strength: 62,
			},
		],
		missing: [
			"Confirmar quién responde los comentarios",
			"Confirmar el tamaño real del catálogo",
		],
	},
	{
		sourceId: "hackathon-demo-4",
		name: "Taller Motos El Rayo",
		slug: "motos-el-rayo",
		city: "Cali",
		industry: "Servicios / Talleres",
		contact: { firstName: "Julián", title: "Propietario" },
		scores: { evidence: 71, opportunity: 68, priority: 74, readiness: 60 },
		scenario:
			"Taller con clientela recurrente que agenda por llamada y WhatsApp sin historial de servicios.",
		competitor: false,
		presence: { instagram: true, facebook: true, whatsapp: true },
		problem:
			"No hay registro del historial de cada moto, por lo que no se puede avisar cuándo toca el siguiente servicio.",
		offer: "AUTOMATION_CRM",
		whyOffer:
			"La clientela es recurrente. Un CRM simple con recordatorios de mantenimiento convierte el historial en ventas repetidas.",
		plan: [
			"Registrar cada moto y su historial de servicios",
			"Enviar recordatorios de mantenimiento aprobados por el propietario",
		],
		price:
			"Rango de conversación inicial: 2M - 3.5M COP, a confirmar según volumen de clientes.",
		channel: "WhatsApp",
		opener:
			"Hola Julián, vi que el taller atiende a muchos clientes recurrentes por WhatsApp. Quisiera entender cómo saben hoy cuándo le toca el siguiente servicio a cada moto.",
		questions: [
			"¿Cómo llevan hoy el historial de cada moto?",
			"¿Cuántos clientes vuelven sin que ustedes los llamen?",
		],
		evidence: [
			{
				claim:
					"Instagram con publicaciones de servicios y clientes recurrentes",
				strength: 72,
			},
			{
				claim: "Canal de WhatsApp público para agendar servicios",
				strength: 75,
			},
		],
		missing: ["Confirmar cuántos clientes recurrentes tiene el taller"],
		decision: {
			status: "APPROVED",
			reason:
				"La evidencia es sólida y el problema es concreto: clientela recurrente sin historial. Vale la pena una primera conversación.",
			daysAgo: 2,
		},
	},
	{
		sourceId: "hackathon-demo-5",
		name: "Gimnasio Fuerza Andina",
		slug: "fuerza-andina",
		city: "Bucaramanga",
		industry: "Deporte / Gimnasios",
		contact: { firstName: "Laura", title: "Coordinadora" },
		scores: { evidence: 45, opportunity: 38, priority: 31, readiness: 25 },
		scenario:
			"Parece sede de una cadena con sistema propio; la evidencia no confirma autonomía de compra.",
		competitor: true,
		presence: { instagram: true, facebook: false, whatsapp: false },
		problem:
			"No se confirma que la sede decida sobre herramientas digitales; probablemente lo gestiona la casa matriz.",
		offer: "NO_CONTACT_NOW",
		whyOffer:
			"Sin evidencia de autonomía de compra, contactar a esta sede desperdicia esfuerzo y puede afectar la reputación.",
		plan: [
			"Confirmar si la sede decide sobre sus herramientas antes de cualquier contacto",
		],
		price: "No aplica hasta confirmar quién decide la compra.",
		channel: "Ninguno por ahora",
		opener: "No contactar por ahora.",
		questions: [
			"¿La sede decide de forma independiente sobre herramientas digitales?",
		],
		evidence: [
			{ claim: "Instagram con marca de una cadena nacional", strength: 45 },
		],
		missing: [
			"Confirmar si es franquicia o sede propia",
			"Confirmar quién decide la compra de herramientas",
		],
		decision: {
			status: "REJECTED",
			reason:
				"Parece una sede de cadena sin autonomía de compra. Contactarla arriesga la reputación sin probabilidad real de cierre.",
			daysAgo: 1,
		},
	},
];

function syntheticUrl(host: string, slug: string): string {
	return `https://${host}.${SYNTHETIC_TLD}/sintetico/${slug}`;
}

function dossierFor(spec: Spec) {
	return {
		version: "lead-os-eve-v1",
		generated_at: new Date().toISOString(),
		classification: {
			status: "REVIEW_REQUIRED",
			scenario: spec.scenario,
			possible_competitor: spec.competitor,
		},
		scores: {
			evidence_quality: spec.scores.evidence,
			commercial_opportunity: spec.scores.opportunity,
			contact_priority: spec.scores.priority,
			contact_readiness: spec.scores.readiness,
		},
		digital_presence: {
			owned_website: false,
			website_accessible: false,
			instagram: spec.presence.instagram,
			tiktok: false,
			facebook: spec.presence.facebook,
			pagespeed_mobile: null,
			forms: 0,
			booking_links: 0,
			whatsapp_links: spec.presence.whatsapp ? 1 : 0,
		},
		commercial_assessment: {
			problem: spec.problem,
			recommended_offer: spec.offer,
			offer_code: spec.offer,
			why_this_offer: spec.whyOffer,
			implementation_plan: spec.plan,
			price_guidance: spec.price,
			recommended_channel: spec.channel,
			call_opener: spec.opener,
			discovery_questions: spec.questions,
		},
		evidence: spec.evidence.map((item) => ({
			claim: item.claim,
			source: syntheticUrl("evidencia", spec.slug),
			strength: item.strength,
		})),
		missing_evidence: spec.missing,
		guardrails: [
			"Datos sintéticos: no contactar a ninguna persona ni negocio de esta lista",
			"No inventar precios de productos del negocio",
			"No prometer tiempos de entrega sin confirmarlos con el negocio",
		],
	};
}

function descriptionFor(spec: Spec, reviewer: string): string {
	const dossier = dossierFor(spec);
	const decided = spec.decision;
	return [
		`Lead OS source: ${spec.sourceId}`,
		"Datos sintéticos: sí",
		`Score: ${spec.scores.opportunity}/100`,
		`Oferta recomendada: ${spec.offer}`,
		`Motivo de oferta: ${spec.whyOffer}`,
		"Etapa Lead OS: REVIEW_REQUIRED",
		`Revisión: ${decided?.status ?? "PENDING"}`,
		`No contactar: ${decided?.status === "APPROVED" ? "no" : "sí"}`,
		decided ? `Revisado por: ${reviewer}` : null,
		`Motivo de revisión: ${decided?.reason ?? "Evidencia suficiente; requiere decisión humana antes de contactar."}`,
		`Dolor: ${spec.problem}`,
		`Evidencia: ${syntheticUrl("evidencia", spec.slug)}`,
		`Dossier Lead OS: ${JSON.stringify(dossier)}`,
	]
		.filter(Boolean)
		.join("\n");
}

async function seedReviewer(): Promise<string> {
	const reviewer = await db.user.upsert({
		where: { email: `revisor-demo@sintetico.${SYNTHETIC_TLD}` },
		create: {
			id: REVIEWER_ID,
			name: REVIEWER_NAME,
			email: `revisor-demo@sintetico.${SYNTHETIC_TLD}`,
			emailVerified: true,
			updatedAt: new Date(),
		},
		update: {},
		select: { id: true },
	});
	return reviewer.id;
}

async function seedOwner(fallbackId: string): Promise<string> {
	const existing = await db.user.findFirst({
		where: { id: { not: fallbackId } },
		orderBy: { createdAt: "asc" },
		select: { id: true },
	});
	return existing?.id ?? fallbackId;
}

async function seedCompany(spec: Spec, ownerId: string, reviewerId: string) {
	const domain = `${spec.slug}.${SYNTHETIC_TLD}`;
	const description = descriptionFor(spec, REVIEWER_NAME);
	const whatsappUrl = spec.presence.whatsapp
		? syntheticUrl("whatsapp", spec.slug)
		: null;
	const instagramUrl = spec.presence.instagram
		? syntheticUrl("instagram", spec.slug)
		: null;
	const facebookUrl = spec.presence.facebook
		? syntheticUrl("facebook", spec.slug)
		: null;
	const fields = {
		name: `${spec.name} (sintético)`,
		city: spec.city,
		country: "Colombia",
		countryCode: "CO",
		industry: spec.industry,
		phone: "+57 000 000 0000",
		instagramUrl,
		facebookUrl,
		whatsappUrl,
		description,
	};

	const company = await db.company.upsert({
		where: { domain },
		create: {
			...fields,
			domain,
			website: null,
			source: RecordSource.IMPORT,
			enrichmentStatus: "SKIPPED",
			ownerId,
		},
		update: fields,
		select: { id: true },
	});

	const email = `contacto@${domain}`;
	const contact = await db.contact.upsert({
		where: { email },
		create: {
			companyId: company.id,
			firstName: spec.contact.firstName,
			lastName: "(sintético)",
			email,
			phone: "+57 000 000 0000",
			title: spec.contact.title,
			instagramUrl,
			whatsappUrl,
			source: RecordSource.IMPORT,
			enrichmentStatus: "SKIPPED",
			ownerId,
		},
		update: {},
		select: { id: true },
	});
	await db.company.update({
		where: { id: company.id },
		data: { primaryContactId: contact.id },
	});

	await db.activity.deleteMany({
		where: {
			companyId: company.id,
			type: ActivityType.NOTE,
			subject: { startsWith: REVIEW_SUBJECT_PREFIX },
		},
	});
	if (spec.decision) {
		const at = new Date(Date.now() - spec.decision.daysAgo * DAY_MS);
		await db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: `${REVIEW_SUBJECT_PREFIX} ${spec.decision.status === "APPROVED" ? "approved" : "rejected"} by ${REVIEWER_NAME}`,
				body: spec.decision.reason,
				companyId: company.id,
				createdById: reviewerId,
				occurredAt: at,
				meta: {
					leadReviewDecision: spec.decision.status,
					reviewer: REVIEWER_NAME,
				},
			},
		});
	}

	return { id: company.id, name: fields.name };
}

async function main() {
	const reviewerId = await seedReviewer();
	const ownerId = await seedOwner(reviewerId);
	const seeded = [];
	for (const spec of SPECS) {
		seeded.push(await seedCompany(spec, ownerId, reviewerId));
	}
	console.log(
		`Seeded ${seeded.length} synthetic demo companies. Every link uses .${SYNTHETIC_TLD} and cannot reach a real person.`,
	);
	for (const item of seeded) console.log(`  ${item.id}  ${item.name}`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$disconnect();
	});
