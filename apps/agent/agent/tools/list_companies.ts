import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

function readDossier(description: string | null) {
	if (!description) return null;
	const line = description
		.split("\n")
		.find((value) => value.startsWith("Dossier Lead OS: "));
	if (!line) return null;
	try {
		return JSON.parse(line.slice("Dossier Lead OS: ".length));
	} catch {
		return null;
	}
}

export default defineTool({
	description:
		"List companies in the CRM for prioritization. Include Lead OS E/O/P scores, review status, recommended offer, evidence, website, phone, email, WhatsApp and social channels. Use this before saying there are no leads; a company does not need an open deal.",
	inputSchema: z.object({
		limit: z.number().int().min(1).max(50).default(20),
	}),
	async execute({ limit }) {
		const rows = await db.company.findMany({
			orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
			take: limit,
			select: {
				id: true,
				name: true,
				domain: true,
				website: true,
				description: true,
				industry: true,
				city: true,
				countryCode: true,
				phone: true,
				email: true,
				linkedinUrl: true,
				instagramUrl: true,
				facebookUrl: true,
				tiktokUrl: true,
				whatsappUrl: true,
				salesStage: true,
				preferredContactChannel: true,
				enrichmentStatus: true,
				enrichedAt: true,
				enrichment: { select: { source: true, raw: true, fetchedAt: true } },
				lastActivityAt: true,
				createdAt: true,
				_count: { select: { contacts: true, deals: true } },
			},
		});

		return {
			companies: rows.map((row) => {
				const dossier = readDossier(row.description);
				return {
					id: row.id,
					name: row.name,
					domain: row.domain,
					website: row.website,
					industry: row.industry,
					location:
						[row.city, row.countryCode].filter(Boolean).join(", ") || null,
					leadReview: dossier?.classification ?? null,
					scores: dossier?.scores ?? null,
					recommendedOffer: normalizeCommercialOffer(
						dossier?.commercial_assessment?.recommended_offer ?? null,
					),
					commercialAssessment: dossier?.commercial_assessment ?? null,
					contactChannels: {
						phone: row.phone,
						email: row.email,
						linkedin: row.linkedinUrl,
						instagram: row.instagramUrl,
						facebook: row.facebookUrl,
						tiktok: row.tiktokUrl,
						whatsapp: row.whatsappUrl,
					},
					salesStage: row.salesStage,
					preferredContactChannel: row.preferredContactChannel,
					enrichmentStatus: row.enrichmentStatus,
					enrichedAt: row.enrichedAt?.toISOString() ?? null,
					evidence: row.enrichment
						? {
								source: row.enrichment.source,
								fetchedAt: row.enrichment.fetchedAt.toISOString(),
								raw: row.enrichment.raw,
							}
						: null,
					lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
					createdAt: row.createdAt.toISOString(),
					contacts: row._count.contacts,
					deals: row._count.deals,
				};
			}),
			total: rows.length,
			note: "Son empresas y dossiers reales del CRM. Usa solo la evidencia devuelta; no inventes scores u ofertas. Si un dossier no existe, indica que requiere evaluación.",
		};
	},
});

function normalizeCommercialOffer(value: string | null) {
	if (!value) return null;
	const label =
		{
			CONVERSION_WEBSITE: "Páginas web que convierten",
			WEB_SOCIAL_CONVERSION: "Páginas web que convierten",
			STARTER_WEB: "Páginas web que convierten",
			WEB_APP_CUSTOM: "Aplicaciones web a medida",
			APPOINTMENT_SYSTEM: "Aplicaciones web a medida",
			ECOMMERCE_STORE: "Tiendas online para ecommerce",
			CRO_REDESIGN: "Rediseño y CRO",
			CONVERSION_WEB: "Rediseño y CRO",
			ECOMMERCE_RETENTION: "Recuperación y recompra para ecommerce",
		}[value] ?? value;
	const normalized = label.toLocaleLowerCase("es");
	if (
		normalized.includes("crm") ||
		normalized.includes("captación de leads") ||
		normalized.includes("captacion de leads") ||
		normalized.includes("sistema de captación") ||
		normalized.includes("sistema de captacion") ||
		normalized.includes("seguimiento de leads")
	)
		return null;
	if (
		normalized.includes("web de conversión") ||
		normalized.includes("web de conversion")
	)
		return "Páginas web que convierten";
	return label;
}
