import type { Db, Prisma } from "@crm/db";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AgentAccessService } from "../agent/agent-access.service";
import { InjectDatabase } from "../database/database.constants";
import { IntakeService } from "../intake/intake.service";
import type { ScraperRunInput } from "./scrapers.contracts";

type Candidate = Record<string, unknown>;

const RUN_SELECT = {
	id: true,
	provider: true,
	query: true,
	resultCount: true,
	status: true,
	results: true,
	error: true,
	startedAt: true,
	finishedAt: true,
	createdAt: true,
} as const;

@Injectable()
export class ScrapersService {
	private readonly logger = new Logger(ScrapersService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: ConfigService,
		private readonly access: AgentAccessService,
		private readonly intake: IntakeService,
	) {}

	async status(userId: string) {
		await this.access.assertMember(userId);
		const [scrapegraph, runs] = await Promise.all([
			this.scrapegraphStatus(),
			this.db.scraperRun.findMany({
				where: { createdById: userId },
				orderBy: { createdAt: "desc" },
				take: 10,
				select: RUN_SELECT,
			}),
		]);

		return {
			providers: { scrapegraph, discovery: this.discoveryStatus() },
			runs: runs.map(serializeRun),
		};
	}

	async history(limit: number, userId: string) {
		await this.access.assertMember(userId);
		const rows = await this.db.scraperRun.findMany({
			where: { createdById: userId },
			orderBy: { createdAt: "desc" },
			take: limit,
			select: RUN_SELECT,
		});
		return rows.map(serializeRun);
	}

	async run(input: ScraperRunInput, userId: string) {
		await this.access.assertMember(userId);
		const requested = input.query.trim();
		const target = requested || this.discoveryQuery();

		const run = await this.db.scraperRun.create({
			data: {
				provider: input.provider,
				query: target,
				createdById: userId,
			},
			select: RUN_SELECT,
		});

		try {
			const candidates = isPublicUrl(requested)
				? await this.runScrapeGraph(target, input.limit)
				: await this.runDiscoveryPipeline(target, input.limit);
			const safeCandidates = candidates.slice(0, input.limit);
			const saved = await this.db.scraperRun.update({
				where: { id: run.id },
				data: {
					status: "SUCCEEDED",
					resultCount: safeCandidates.length,
					results: safeCandidates as Prisma.InputJsonValue,
					finishedAt: new Date(),
				},
				select: RUN_SELECT,
			});
			this.logger.log({
				message: "Scraper run completed",
				runId: run.id,
				provider: input.provider,
				resultCount: safeCandidates.length,
			});
			return serializeRun(saved);
		} catch (error) {
			const reason = safeError(error);
			const failed = await this.db.scraperRun.update({
				where: { id: run.id },
				data: { status: "FAILED", error: reason, finishedAt: new Date() },
				select: RUN_SELECT,
			});
			this.logger.warn({
				message: "Scraper run failed",
				runId: run.id,
				provider: input.provider,
				reason,
			});
			return serializeRun(failed);
		}
	}

	async importRun(id: string, userId: string) {
		await this.access.assertMember(userId);
		const run = await this.db.scraperRun.findFirst({
			where: { id, createdById: userId },
			select: {
				id: true,
				provider: true,
				query: true,
				status: true,
				results: true,
			},
		});
		if (!run) throw new BadRequestException("Scraper run not found.");
		if (run.status !== "SUCCEEDED") {
			throw new BadRequestException("Only a successful run can be imported.");
		}
		const rows = Array.isArray(run.results) ? run.results : [];
		const leads = rows.flatMap((row, index) => {
			if (!isRecord(row)) return [];
			const contact = nestedContact(row);
			const companyName =
				firstString(row, [
					"name",
					"company_name",
					"companyName",
					"business_name",
				]) ?? `Candidate ${index + 1}`;
			const websiteUrl = firstUrl(row, [
				"website",
				"website_url",
				"websiteUri",
			]);
			return [
				{
					sourceId: `scraper:${run.provider.toLowerCase()}:${run.id}:${index}`,
					companyName,
					websiteUrl,
					city: firstString(row, ["city", "formattedAddress", "address"]),
					niche: firstString(row, ["industry", "category"]),
					phone:
						firstString(row, [
							"phone",
							"phone_number",
							"nationalPhoneNumber",
							"internationalPhoneNumber",
						]) ?? firstString(contact, ["phone", "phone_number"]),
					email: firstEmail(row, ["email"]) ?? firstEmail(contact, ["email"]),
					instagramUrl: firstUrl(row, ["instagram_url", "instagramUrl"]),
					facebookUrl: firstUrl(row, ["facebook_url", "facebookUrl"]),
					tiktokUrl: firstUrl(row, ["tiktok_url", "tiktokUrl"]),
					whatsappUrl: firstWhatsApp(row, contact),
					contactName:
						firstString(row, ["contact_name", "contactName", "owner_name"]) ??
						firstString(contact, ["name", "full_name", "fullName"]),
					contactRole:
						firstString(row, ["contact_role", "contactRole", "owner_role"]) ??
						firstString(contact, ["role", "title", "job_title"]),
					sourceUrl: firstUrl(row, [
						"googleMapsUri",
						"profile_url",
						"source_url",
						"sourceUrl",
					]),
					reviewStatus: "PENDING",
					pipelineStage: "REVIEW_REQUIRED",
					reviewReason:
						"Imported from a manual scraper run; verify evidence before contacting.",
					doNotContact: true,
				},
			];
		});
		const result = await this.intake.import(leads);
		return {
			id: run.id,
			imported: result.imported.filter((item) => !item.skipped).length,
			skipped: result.imported.filter((item) => item.skipped).length,
			total: leads.length,
		};
	}

	private scrapegraphUrl(): string | null {
		const configured = this.config
			.get<string>("SCRAPEGRAPH_URL")
			?.trim()
			.replace(/\/$/, "");
		if (configured) return configured;
		// The local worker is useful for development only. Never make a
		// production deployment call the developer's machine by accident.
		return process.env.NODE_ENV === "production"
			? null
			: "http://127.0.0.1:8011";
	}

	private scrapegraphTarget() {
		return this.config.get<string>("SCRAPEGRAPH_DEFAULT_URL")?.trim() || null;
	}

	private discoveryQuery() {
		return (
			this.config.get<string>("SCRAPEGRAPH_DEFAULT_QUERY")?.trim() ||
			"Agencias de marketing digital en Bogotá, Colombia"
		);
	}

	private discoveryStatus() {
		const localMaps = Boolean(
			this.config.get<string>("LOCAL_MAPS_SCRAPER_URL")?.trim(),
		);
		const googlePlaces = Boolean(
			this.config.get<string>("GOOGLE_MAPS_API_KEY")?.trim(),
		);
		const mindcase = Boolean(
			this.config.get<string>("MINDCASE_API_KEY")?.trim(),
		);
		return {
			configured: localMaps || googlePlaces || mindcase,
			providers: { localMaps, googlePlaces, mindcase },
			query: this.discoveryQuery(),
		};
	}

	private async scrapegraphStatus() {
		const base = this.scrapegraphUrl();
		if (!base) return { configured: false, reachable: false };
		try {
			const response = await fetch(`${base}/health`, {
				signal: AbortSignal.timeout(3000),
			});
			return {
				configured: Boolean(
					this.config.get<string>("SCRAPEGRAPH_URL") ||
						this.scrapegraphTarget(),
				),
				reachable: response.ok,
				status: response.status,
			};
		} catch {
			return { configured: true, reachable: false };
		}
	}

	private async runScrapeGraph(
		target: string,
		limit: number,
	): Promise<Candidate[]> {
		let response: Response;
		try {
			response = await fetch(`${this.scrapegraphUrl()}/research`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ url: target }),
				signal: AbortSignal.timeout(30_000),
			});
		} catch (error) {
			this.logger.warn({
				message:
					"ScrapeGraphAI worker unavailable; using direct public-page fallback",
				reason: safeError(error),
			});
			return this.runDirectResearch(target, limit);
		}
		if (!response.ok) {
			this.logger.warn(
				`ScrapeGraphAI devolvió HTTP ${response.status}; usando fallback de página pública.`,
			);
			return this.runDirectResearch(target, limit);
		}
		const payload: unknown = await response.json();
		if (!isRecord(payload))
			throw new Error("ScrapeGraphAI devolvió un formato no compatible.");
		const result = payload.result;
		const rows = Array.isArray(result) ? result : result ? [result] : [];
		const fallbackName = (() => {
			try {
				return new URL(target).hostname.replace(/^www\./, "");
			} catch {
				return "Investigación ScrapeGraphAI";
			}
		})();
		return rows
			.filter(isRecord)
			.slice(0, limit)
			.map((row) => ({
				...row,
				company_name:
					firstString(row, ["company_name", "companyName", "name"]) ??
					fallbackName,
				website: firstUrl(row, ["website", "website_url"]) ?? target,
				source_url: payload.source_url ?? target,
			}));
	}

	private async runDiscoveryPipeline(
		query: string,
		limit: number,
	): Promise<Candidate[]> {
		const discovered = await this.discoverCandidates(query, limit);
		if (!discovered.length)
			throw new Error(
				`La fuente de descubrimiento no devolvió candidatos para “${query}”.`,
			);

		// Discovery supplies the batch; ScrapeGraph enriches each public website.
		// A small concurrency cap avoids rate spikes and keeps the CRM responsive.
		const enriched: Candidate[] = [];
		for (let index = 0; index < discovered.length; index += 4) {
			const batch = discovered.slice(index, index + 4);
			const rows = await Promise.all(
				batch.map(async (candidate) => {
					const website = firstUrl(candidate, [
						"website",
						"websiteUri",
						"website_url",
					]);
					if (!website) return candidate;
					try {
						const research = await this.runScrapeGraph(website, 1);
						return mergeCandidate(candidate, research[0]);
					} catch (error) {
						this.logger.warn({
							message: "Website enrichment skipped",
							website,
							reason: safeError(error),
						});
						return candidate;
					}
				}),
			);
			enriched.push(...rows);
		}
		return enriched;
	}

	private async discoverCandidates(
		query: string,
		limit: number,
	): Promise<Candidate[]> {
		const localBase = this.config
			.get<string>("LOCAL_MAPS_SCRAPER_URL")
			?.trim()
			.replace(/\/$/, "");
		if (localBase) {
			const response = await fetch(
				`${localBase}/scrape-get?query=${encodeURIComponent(query)}&max_places=${limit}&lang=es&headless=true&concurrency=3`,
				{ signal: AbortSignal.timeout(300_000) },
			);
			if (!response.ok)
				throw new Error(
					`El scraper anterior devolvió HTTP ${response.status}.`,
				);
			const rows = await response.json();
			return Array.isArray(rows)
				? rows.filter(isRecord).map(normalizeDiscoveryCandidate).slice(0, limit)
				: [];
		}

		const placesKey = this.config.get<string>("GOOGLE_MAPS_API_KEY")?.trim();
		if (placesKey) {
			const response = await fetch(
				"https://places.googleapis.com/v1/places:searchText",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Goog-Api-Key": placesKey,
						"X-Goog-FieldMask":
							"places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri,places.rating,places.userRatingCount",
					},
					body: JSON.stringify({
						textQuery: query,
						languageCode: "es",
						regionCode: "CO",
						pageSize: Math.min(limit, 20),
					}),
					signal: AbortSignal.timeout(30_000),
				},
			);
			if (!response.ok)
				throw new Error(`Google Places devolvió HTTP ${response.status}.`);
			const payload: unknown = await response.json();
			return isRecord(payload) && Array.isArray(payload.places)
				? payload.places
						.filter(isRecord)
						.map(normalizeDiscoveryCandidate)
						.slice(0, limit)
				: [];
		}

		const mindcaseKey = this.config.get<string>("MINDCASE_API_KEY")?.trim();
		if (mindcaseKey) {
			const agent =
				this.config.get<string>("MINDCASE_DISCOVERY_AGENT")?.trim() ||
				"instagram/profiles";
			const response = await fetch(
				`https://api.mindcase.co/v1/data/${agent}/run?wait=true`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${mindcaseKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ params: { query, limit } }),
					signal: AbortSignal.timeout(90_000),
				},
			);
			if (!response.ok)
				throw new Error(`Mindcase devolvió HTTP ${response.status}.`);
			const payload: unknown = await response.json();
			const rows =
				isRecord(payload) && Array.isArray(payload.data)
					? payload.data
					: isRecord(payload) && payload.data
						? [payload.data]
						: [];
			return rows
				.filter(isRecord)
				.map(normalizeDiscoveryCandidate)
				.slice(0, limit);
		}

		throw new Error(
			"No hay fuente de descubrimiento configurada. Define LOCAL_MAPS_SCRAPER_URL, GOOGLE_MAPS_API_KEY o MINDCASE_API_KEY.",
		);
	}

	/**
	 * Small dependency-free fallback for a public URL. It keeps lead generation
	 * usable while a remote ScrapeGraph deployment is being updated and never
	 * logs in, submits forms, or contacts a business.
	 */
	private async runDirectResearch(
		target: string,
		limit: number,
	): Promise<Candidate[]> {
		const url = new URL(target);
		if (!/^https?:$/.test(url.protocol))
			throw new Error(
				"La URL debe ser pública y comenzar por http:// o https://.",
			);
		const response = await fetch(url, {
			headers: { Accept: "text/html,application/xhtml+xml" },
			signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok)
			throw new Error(`La página pública devolvió HTTP ${response.status}.`);

		const html = (await response.text()).slice(0, 2_000_000);
		const title = decodeHtml(
			html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
				url.hostname.replace(/^www\./, ""),
		);
		const description = decodeHtml(
			html.match(
				/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
			)?.[1] ?? "",
		);
		const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
			.map((match) => match[1] ?? "")
			.map((href) => {
				try {
					return new URL(decodeHtml(href), url).toString();
				} catch {
					return null;
				}
			})
			.filter((href): href is string => Boolean(href));
		const emails = unique(
			[...html.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi)].map((match) =>
				match[0].toLowerCase(),
			),
		);
		const phones = unique(
			[
				...html.matchAll(/(?:\+?57[\s.-]?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/g),
			].map((match) => match[0].trim()),
		);
		const social = (host: string) =>
			links.find((href) => {
				try {
					return new URL(href).hostname.toLowerCase().includes(host);
				} catch {
					return false;
				}
			}) ?? null;
		const whatsappUrl = links.find((href) =>
			/^https?:\/\/(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(
				href,
			),
		);

		return [
			{
				company_name: title || url.hostname,
				website: url.toString(),
				source_url: url.toString(),
				description: description || null,
				email: emails[0] ?? null,
				phone: phones[0] ?? null,
				whatsapp_url: whatsappUrl ?? null,
				instagram_url: social("instagram.com"),
				facebook_url: social("facebook.com"),
				tiktok_url: social("tiktok.com"),
				_evidence: {
					method: "public-page-fallback",
					emails,
					phones,
					links: links.slice(0, 25),
				},
			},
		].slice(0, limit);
	}
}

function decodeHtml(value: string) {
	return value
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/\s+/g, " ")
		.trim();
}

function unique(values: string[]) {
	return [...new Set(values)];
}

function serializeRun(row: {
	id: string;
	provider: string;
	query: string;
	resultCount: number;
	status: string;
	results: unknown;
	error: string | null;
	startedAt: Date;
	finishedAt: Date | null;
	createdAt: Date;
}) {
	return {
		...row,
		startedAt: row.startedAt.toISOString(),
		finishedAt: row.finishedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
	};
}

function isRecord(value: unknown): value is Candidate {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(row: Candidate, keys: string[]) {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value === "number") return String(value);
	}
	return null;
}

function firstUrl(row: Candidate, keys: string[]) {
	const value = firstString(row, keys);
	if (!value) return null;
	try {
		return new URL(value).toString();
	} catch {
		return null;
	}
}

function isPublicUrl(value: string) {
	return /^https?:\/\//i.test(value);
}

function normalizeDiscoveryCandidate(row: Candidate): Candidate {
	const displayName = isRecord(row.displayName)
		? firstString(row.displayName, ["text"])
		: null;
	return {
		...row,
		company_name:
			firstString(row, [
				"company_name",
				"companyName",
				"business_name",
				"businessName",
				"name",
				"displayName",
			]) ??
			displayName ??
			"Candidato sin nombre",
		website: firstUrl(row, ["website", "websiteUri", "website_url", "url"]),
		phone: firstString(row, [
			"phone",
			"phone_number",
			"nationalPhoneNumber",
			"internationalPhoneNumber",
		]),
		city: firstString(row, ["city", "formattedAddress", "address", "location"]),
		source_url: firstUrl(row, [
			"source_url",
			"sourceUrl",
			"googleMapsUri",
			"profile_url",
		]),
	};
}

function mergeCandidate(base: Candidate, enrichment: Candidate | undefined) {
	if (!enrichment) return base;
	const merged = { ...base, ...enrichment };
	for (const key of [
		"company_name",
		"website",
		"phone",
		"email",
		"whatsapp_url",
		"instagram_url",
		"facebook_url",
		"tiktok_url",
		"source_url",
	]) {
		if (enrichment[key] == null || enrichment[key] === "")
			merged[key] = base[key];
	}
	return merged;
}

function nestedContact(row: Candidate): Candidate {
	const direct = row.contact;
	if (isRecord(direct)) return direct;
	const contacts = row.contacts;
	if (Array.isArray(contacts) && isRecord(contacts[0])) return contacts[0];
	return {};
}

function firstWhatsApp(row: Candidate, contact: Candidate = {}) {
	const value =
		firstString(row, [
			"whatsapp_url",
			"whatsappUrl",
			"whatsapp",
			"whatsapp_number",
			"whatsappPhone",
		]) ??
		firstString(contact, [
			"whatsapp_url",
			"whatsappUrl",
			"whatsapp",
			"whatsapp_number",
		]);
	if (!value) return null;
	if (/^https?:\/\//i.test(value)) {
		try {
			const url = new URL(value);
			const host = url.hostname.toLowerCase();
			return host === "wa.me" || host.endsWith(".whatsapp.com")
				? url.toString()
				: null;
		} catch {
			return null;
		}
	}
	const digits = value.replace(/[^\d]/g, "");
	if (digits.length === 10 && digits.startsWith("3"))
		return `https://wa.me/57${digits}`;
	return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}

function firstEmail(row: Candidate, keys: string[]) {
	const value = firstString(row, keys)?.toLowerCase();
	return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

function safeError(error: unknown) {
	return error instanceof Error
		? error.message.slice(0, 500)
		: "Scraper failed.";
}
