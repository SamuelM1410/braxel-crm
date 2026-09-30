import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";

const Place = z.object({
	id: z.string().optional(),
	displayName: z.object({ text: z.string().optional() }).optional(),
	formattedAddress: z.string().optional(),
	websiteUri: z.string().url().optional(),
	nationalPhoneNumber: z.string().optional(),
	internationalPhoneNumber: z.string().optional(),
	googleMapsUri: z.string().url().optional(),
	rating: z.number().optional(),
	userRatingCount: z.number().optional(),
});

const Response = z.object({ places: z.array(Place).default([]) }).passthrough();

export default defineTool({
	description:
		"Discover public business identities through Google Maps. Return evidence only. Maps discovery is not qualification and never sends messages.",
	inputSchema: z.object({
		query: z.string().trim().min(2).max(240),
		limit: z.number().int().min(1).max(20).default(20),
	}),
	async execute({ query, limit }) {
		const localBase = process.env.LOCAL_MAPS_SCRAPER_URL?.trim().replace(
			/\/$/,
			"",
		);
		if (localBase) {
			const local = await fetch(
				`${localBase}/scrape-get?query=${encodeURIComponent(query)}&max_places=${limit}&lang=es&headless=true&concurrency=3`,
				{ signal: AbortSignal.timeout(300_000) },
			);
			if (!local.ok)
				return {
					ok: false as const,
					reason: `Local Maps scraper returned HTTP ${local.status}.`,
				};
			const rows = z
				.array(z.record(z.string(), z.unknown()))
				.safeParse(await local.json());
			if (!rows.success)
				return {
					ok: false as const,
					reason: "Local Maps scraper returned an unsupported shape.",
				};
			return {
				ok: true as const,
				provider: "local_maps_scraper" as const,
				query,
				candidates: rows.data.slice(0, limit),
				count: Math.min(rows.data.length, limit),
				guardrail:
					"Candidatos obtenidos del scraper local. Eve debe verificar evidencia antes de calificarlos o contactar.",
			};
		}
		const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
		if (!key) return unavailable("GOOGLE_MAPS_API_KEY");
		const response = await fetch(
			"https://places.googleapis.com/v1/places:searchText",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Goog-Api-Key": key,
					"X-Goog-FieldMask":
						"places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri,places.rating,places.userRatingCount",
				},
				body: JSON.stringify({
					textQuery: query,
					languageCode: "es",
					regionCode: "CO",
					pageSize: limit,
				}),
				signal: AbortSignal.timeout(30_000),
			},
		);
		if (!response.ok)
			return {
				ok: false as const,
				reason: `Google Places returned HTTP ${response.status}.`,
			};
		const parsed = Response.safeParse(await response.json());
		if (!parsed.success)
			return {
				ok: false as const,
				reason: "Google Places returned an unsupported shape.",
			};
		return {
			ok: true as const,
			provider: "google_places" as const,
			query,
			candidates: parsed.data.places.slice(0, limit),
			count: Math.min(parsed.data.places.length, limit),
			guardrail:
				"Estos son candidatos de descubrimiento. Eve debe verificar evidencia antes de calificarlos o contactar.",
		};
	},
});
