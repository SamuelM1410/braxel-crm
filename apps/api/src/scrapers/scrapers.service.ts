import type { Db, Prisma } from "@crm/db";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AgentAccessService } from "../agent/agent-access.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { normalizePhone, normalizeWhatsAppUrl } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { IntakeService } from "../intake/intake.service";
import type { ScraperRunInput } from "./scrapers.contracts";

type Candidate = Record<string, unknown>;

const CURRENT_DISCOVERY_CAMPAIGN =
	"Marcas de ropa de fútbol con una brecha comercial verificable en Colombia";
const CURRENT_CAMPAIGN_INDUSTRY = "Ropa de fútbol";
const LEGACY_DISCOVERY_QUERY =
	"Agencias de marketing digital en Bogotá, Colombia";

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
		private readonly agent: AgentTriggerService,
		private readonly intake: IntakeService,
	) {}

	async status(userId: string) {
		await this.access.assertMember(userId);
		await this.failStaleRuns(userId);
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
		await this.failStaleRuns(userId);
		const rows = await this.db.scraperRun.findMany({
			where: { createdById: userId },
			orderBy: { createdAt: "desc" },
			take: limit,
			select: RUN_SELECT,
		});
		return rows.map(serializeRun);
	}

	private async failStaleRuns(userId: string) {
		const finishedAt = new Date();
		await this.db.scraperRun.updateMany({
			where: {
				createdById: userId,
				status: "RUNNING",
				startedAt: { lt: new Date(finishedAt.getTime() - 5 * 60_000) },
			},
			data: {
				status: "FAILED",
				error:
					"La ejecución excedió el tiempo máximo y se detuvo sin importar datos.",
				finishedAt,
			},
		});
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
			// Do not show companies that are already in the CRM. Intake protects
			// persistence too, but filtering here keeps the review queue useful.
			const freshCandidates = await this.filterExistingCandidates(candidates);
			const safeCandidates = freshCandidates.slice(0, input.limit);
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
			// Keep discovery and CRM intake as one safe operation. Imported rows
			// remain REVIEW_REQUIRED + doNotContact, so automation never sends
			// outreach merely because a scraper run finished.
			let autoImport: Awaited<ReturnType<ScrapersService["importRun"]>> | null =
				null;
			try {
				autoImport = await this.importRun(run.id, userId);
			} catch (importError) {
				this.logger.warn({
					message: "Scraper results saved but automatic CRM import failed",
					runId: run.id,
					reason: safeError(importError),
				});
			}
			this.logger.log({
				message: "Scraper run completed",
				runId: run.id,
				provider: input.provider,
				resultCount: safeCandidates.length,
			});
			return { ...serializeRun(saved), autoImport };
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

	private async filterExistingCandidates(candidates: Candidate[]) {
		const existing = await this.db.company.findMany({
			select: {
				name: true,
				domain: true,
				phone: true,
				instagramUrl: true,
				facebookUrl: true,
				tiktokUrl: true,
				linkedinUrl: true,
			},
		});
		const fresh: Candidate[] = [];
		for (const candidate of candidates) {
			const existingCandidate = existing.some((company) =>
				sameCandidate(
					{
						company_name: company.name,
						domain: company.domain,
						phone: company.phone,
						instagram_url: company.instagramUrl,
						facebook_url: company.facebookUrl,
						tiktok_url: company.tiktokUrl,
						linkedin_url: company.linkedinUrl,
					},
					candidate,
				),
			);
			if (existingCandidate) continue;
			if (!fresh.some((item) => sameCandidate(item, candidate)))
				fresh.push(candidate);
		}
		return fresh;
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
			// Runs created before the quality rules were tightened can still be
			// imported. Re-apply the same commercial-fit gate at import time so a
			// stale run cannot reintroduce a fully built competitor.
			if (isFootballCampaign(run.query) && !isHighQualityFootballLead(row))
				return [];
			const contact = nestedContact(row);
			const companyName =
				firstString(row, [
					"name",
					"company_name",
					"companyName",
					"business_name",
				]) ?? `Candidate ${index + 1}`;
			const discoveredUrl = firstUrl(row, [
				"website",
				"website_url",
				"websiteUri",
			]);
			const websiteUrl =
				discoveredUrl && !isSocialOrMessagingUrl(discoveredUrl)
					? discoveredUrl
					: null;
			return [
				{
					sourceId: `scraper:${run.provider.toLowerCase()}:${run.id}:${index}`,
					companyName,
					websiteUrl,
					city: firstString(row, ["city", "formattedAddress", "address"]),
					niche:
						campaignIndustry(run.query) ??
						firstString(row, ["industry", "category"]),
					phone: normalizePhone(
						firstString(row, [
							"phone",
							"phone_number",
							"nationalPhoneNumber",
							"internationalPhoneNumber",
						]) ??
							firstString(contact, ["phone", "phone_number"]) ??
							firstPublicContactValue(row, "phones"),
					),
					email:
						firstEmail(row, ["email"]) ??
						firstEmail(contact, ["email"]) ??
						firstPublicContactValue(row, "emails"),
					instagramUrl:
						firstUrl(row, ["instagram_url", "instagramUrl"]) ??
						socialUrlFromEvidence(row, "instagram") ??
						socialProfileUrl(discoveredUrl, "instagram.com"),
					facebookUrl:
						firstUrl(row, ["facebook_url", "facebookUrl"]) ??
						socialUrlFromEvidence(row, "facebook") ??
						socialProfileUrl(discoveredUrl, "facebook.com"),
					tiktokUrl:
						firstUrl(row, ["tiktok_url", "tiktokUrl"]) ??
						socialUrlFromEvidence(row, "tiktok") ??
						socialProfileUrl(discoveredUrl, "tiktok.com"),
					linkedinUrl:
						firstUrl(row, ["linkedin_url", "linkedinUrl"]) ??
						socialUrlFromEvidence(row, "linkedin"),
					whatsappUrl: normalizeWhatsAppUrl(
						firstWhatsApp(row, contact) ??
							socialProfileUrl(discoveredUrl, "wa.me", "whatsapp.com"),
					),
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
		const companyIds = result.imported.flatMap((item) =>
			item.skipped || !item.companyId ? [] : [item.companyId],
		);
		const evaluation = await this.agent.backfill({
			kind: "company-profile",
			reason:
				"Evaluate commercial fit against Braxel's current offer catalogue",
			companyIds,
			budget: 8,
		});
		return {
			id: run.id,
			imported: result.imported.filter((item) => !item.skipped).length,
			skipped: result.imported.filter((item) => item.skipped).length,
			total: leads.length,
			evaluation,
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
		const configured = this.config
			.get<string>("SCRAPEGRAPH_DEFAULT_QUERY")
			?.trim();
		// Keep old production configuration from silently sending the current
		// campaign back to agencies. Reps can still enter another query explicitly
		// in the CRM when they intentionally want to research another segment.
		return configured && configured !== LEGACY_DISCOVERY_QUERY
			? configured
			: CURRENT_DISCOVERY_CAMPAIGN;
	}

	private discoveryStatus() {
		const localMapsFallback = process.env.NODE_ENV !== "production";
		const localMaps = Boolean(
			this.config.get<string>("LOCAL_MAPS_SCRAPER_URL")?.trim() ||
				(localMapsFallback && "http://127.0.0.1:8001"),
		);
		const googlePlaces = Boolean(
			this.config.get<string>("GOOGLE_MAPS_API_KEY")?.trim(),
		);
		const socialDiscovery = Boolean(this.socialDiscoveryUrl());
		return {
			configured: localMaps || googlePlaces || socialDiscovery,
			providers: {
				localMaps,
				localMapsFallback,
				googlePlaces,
				socialDiscovery,
			},
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
		timeoutMs = 30_000,
	): Promise<Candidate[]> {
		let response: Response;
		try {
			response = await fetch(`${this.scrapegraphUrl()}/research`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ url: target }),
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch (error) {
			this.logger.warn({
				message:
					"ScrapeGraphAI worker unavailable; using direct public-page fallback",
				reason: safeError(error),
			});
			return this.runDirectResearch(target, limit, timeoutMs);
		}
		if (!response.ok) {
			this.logger.warn(
				`ScrapeGraphAI devolvió HTTP ${response.status}; usando fallback de página pública.`,
			);
			return this.runDirectResearch(target, limit, timeoutMs);
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
		const discovered = (await this.discoverCandidates(query, limit)).filter(
			(candidate) => !isDiscoveryNoiseCandidate(candidate),
		);
		if (!discovered.length)
			throw new Error(
				`La fuente de descubrimiento no devolvió candidatos para “${query}”.`,
			);

		// Discovery supplies the batch; ScrapeGraph enriches each public website.
		// A small concurrency cap avoids rate spikes and keeps the CRM responsive.
		const enriched: Candidate[] = [];
		for (let index = 0; index < discovered.length; index += 8) {
			const batch = discovered.slice(index, index + 8);
			const rows = await Promise.all(
				batch.map(async (candidate) => {
					const website = firstUrl(candidate, [
						"website",
						"websiteUri",
						"website_url",
					]);
					if (!website || isSocialOrMessagingUrl(website)) return candidate;
					try {
						// Discovery must not be held hostage by slow merchant sites. The
						// Maps record is enough to screen a mobile WhatsApp candidate;
						// enrichment is opportunistic and bounded per public website.
						const research = await this.runScrapeGraph(website, 1, 7_000);
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
		return isFootballCampaign(query)
			? enriched.filter(isHighQualityFootballLead)
			: enriched;
	}

	private async discoverCandidates(
		query: string,
		limit: number,
	): Promise<Candidate[]> {
		const footballCampaign = isFootballCampaign(query);
		// Candidate discovery and commercial qualification are separate stages.
		// Collect a larger pool of mobile football businesses first; otherwise a
		// single city can fill the raw limit before the quality rules are applied.
		const targetPool = footballCampaign ? Math.min(limit * 2, 60) : limit;
		const candidates: Candidate[] = [];
		const queries = discoveryQueries(query);
		for (let index = 0; index < queries.length; index += 3) {
			const batch = queries.slice(index, index + 3);
			const rows = await Promise.all(
				batch.map((discoveryQuery) =>
					this.discoverCandidatesForQuery(discoveryQuery, 20),
				),
			);
			for (const discovered of rows) {
				for (const candidate of discovered) {
					if (isDiscoveryNoiseCandidate(candidate)) continue;
					if (!candidates.some((item) => sameCandidate(item, candidate))) {
						candidates.push(candidate);
					}
				}
			}
			const usableCount = footballCampaign
				? candidates.filter(isFootballMobileCandidate).length
				: candidates.length;
			if (usableCount >= targetPool) break;
		}
		const usable = footballCampaign
			? candidates.filter(isFootballMobileCandidate)
			: candidates;
		return usable.slice(0, targetPool);
	}

	private async discoverCandidatesForQuery(
		query: string,
		limit: number,
	): Promise<Candidate[]> {
		const localBase =
			this.config
				.get<string>("LOCAL_MAPS_SCRAPER_URL")
				?.trim()
				.replace(/\/$/, "") ||
			(process.env.NODE_ENV !== "production"
				? "http://127.0.0.1:8001"
				: undefined);
		// Run both discovery sources when they are available. The legacy Maps
		// scraper is usually richer in phone/social evidence, while Places is a
		// useful second index. We merge and deduplicate instead of choosing one,
		// so a single provider outage no longer makes the campaign fail.
		const discovered: Candidate[] = [];
		const failures: string[] = [];
		const socialRows = await this.discoverSocialCandidates(query, limit);
		discovered.push(...socialRows);
		if (localBase) {
			try {
				const response = await fetch(
					`${localBase}/scrape-get?query=${encodeURIComponent(query)}&max_places=${limit}&lang=es&headless=true&concurrency=3`,
					// A stalled legacy worker must not block Places for the full API
					// request window. Local development keeps the generous timeout;
					// production fails over quickly to the second discovery source.
					{
						signal: AbortSignal.timeout(
							process.env.NODE_ENV === "production" ? 45_000 : 300_000,
						),
					},
				);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const rows = await response.json();
				if (Array.isArray(rows))
					discovered.push(
						...rows.filter(isRecord).map(normalizeDiscoveryCandidate),
					);
			} catch (error) {
				failures.push(`Maps: ${safeError(error)}`);
				this.logger.warn({
					message: "Legacy Maps discovery unavailable",
					query,
				});
			}
		}

		const placesKey = this.config.get<string>("GOOGLE_MAPS_API_KEY")?.trim();
		if (placesKey) {
			try {
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
						// A discovery request is only the first pass; do not let a single
						// city block the whole campaign while later queries could return
						// usable mobile contacts.
						signal: AbortSignal.timeout(12_000),
					},
				);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const payload: unknown = await response.json();
				if (isRecord(payload) && Array.isArray(payload.places))
					discovered.push(
						...payload.places.filter(isRecord).map(normalizeDiscoveryCandidate),
					);
			} catch (error) {
				failures.push(`Places: ${safeError(error)}`);
				this.logger.warn({
					message: "Google Places discovery unavailable",
					query,
				});
			}
		}

		const uniqueCandidates = discovered.filter(
			(candidate, index) =>
				discovered.findIndex((item) => sameCandidate(item, candidate)) ===
				index,
		);
		if (uniqueCandidates.length) return uniqueCandidates.slice(0, limit);
		throw new Error(
			process.env.NODE_ENV !== "production" && !localBase && !placesKey
				? "El scraper local no está disponible en http://127.0.0.1:8001. Inícialo con local-gmaps-scraper/main_api.py o define LOCAL_MAPS_SCRAPER_URL."
				: `No hay candidatos de Maps/Places para “${query}”. ${failures.join("; ")}`,
		);
	}

	/**
	 * Optional public-social discovery bridge. The bridge can be backed by
	 * Mindcase, Apify or another provider, but it must return public business
	 * records only. The CRM never logs in, sends messages or treats a profile
	 * URL as consent. Expected response: { rows: [...] } (also accepts
	 * candidates/results/data for simple adapters).
	 */
	private async discoverSocialCandidates(query: string, limit: number) {
		const base = this.socialDiscoveryUrl();
		if (!base) return [];
		try {
			const response = await fetch(`${base}/discover`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query,
					limit: Math.min(limit, 100),
					industry: campaignIndustry(query),
				}),
				signal: AbortSignal.timeout(8_000),
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const payload: unknown = await response.json();
			if (!isRecord(payload)) return [];
			const rows = [
				payload.rows,
				payload.candidates,
				payload.results,
				payload.data,
			].find((value) => Array.isArray(value)) as unknown[] | undefined;
			return (rows ?? [])
				.filter(isRecord)
				.map(normalizeDiscoveryCandidate)
				.filter((candidate) => !isDiscoveryNoiseCandidate(candidate));
		} catch (error) {
			this.logger.warn({
				message: "Public social discovery bridge unavailable",
				reason: safeError(error),
			});
			return [];
		}
	}

	private socialDiscoveryUrl() {
		const configured =
			this.config.get<string>("SOCIAL_DISCOVERY_URL")?.trim() ||
			this.config.get<string>("SCRAPEGRAPH_URL")?.trim();
		return configured?.replace(/\/$/, "") || null;
	}

	/**
	 * Small dependency-free fallback for a public URL. It keeps lead generation
	 * usable while a remote ScrapeGraph deployment is being updated and never
	 * logs in, submits forms, or contacts a business.
	 */
	private async runDirectResearch(
		target: string,
		limit: number,
		timeoutMs = 30_000,
	): Promise<Candidate[]> {
		const url = new URL(target);
		if (!/^https?:$/.test(url.protocol))
			throw new Error(
				"La URL debe ser pública y comenzar por http:// o https://.",
			);
		const response = await fetch(url, {
			headers: { Accept: "text/html,application/xhtml+xml" },
			signal: AbortSignal.timeout(timeoutMs),
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
				phone: normalizePhone(phones[0]),
				whatsapp_url: normalizeWhatsAppUrl(whatsappUrl),
				instagram_url: social("instagram.com"),
				facebook_url: social("facebook.com"),
				tiktok_url: social("tiktok.com"),
				linkedin_url: social("linkedin.com"),
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

function campaignIndustry(query: string) {
	return isFootballCampaign(query) ? CURRENT_CAMPAIGN_INDUSTRY : null;
}

function isFootballCampaign(query: string) {
	const normalized = query
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	return (
		/(futbol|camiseta|uniforme|ropa deportiva|tienda deportiva|soccer|jersey)/i.test(
			normalized,
		) && !/\b(agencia|marketing digital)\b/i.test(normalized)
	);
}

function discoveryQueries(query: string) {
	// The default campaign may fan out across cities. An explicit query stays
	// single-shot so one slow city cannot consume the whole five-minute run.
	if (query !== CURRENT_DISCOVERY_CAMPAIGN) return [query];
	// Start with dense, high-signal searches. `discoverCandidates` stops as
	// soon as the requested batch is full, so one click remains interactive
	// rather than serially waiting through every city in Colombia.
	return [
		"camisetas de fútbol Bogotá Colombia",
		"camisetas de fútbol Medellín Colombia",
		"camisetas de fútbol Cali Colombia",
		"camisetas de fútbol Barranquilla Colombia",
		"camisetas de fútbol Bucaramanga Colombia",
		"camisetas de fútbol Pereira Colombia",
		"uniformes de fútbol Colombia",
		"tienda de ropa deportiva fútbol Colombia",
	];
}

function sameCandidate(left: Candidate, right: Candidate) {
	const leftId = firstString(left, ["id"]);
	const rightId = firstString(right, ["id"]);
	if (leftId && rightId && leftId === rightId) return true;
	const leftDomain = domainFromCandidate(left);
	const rightDomain = domainFromCandidate(right);
	if (leftDomain && rightDomain && leftDomain === rightDomain) return true;
	const leftPhone = normalizePhone(
		firstString(left, ["phone", "phone_number", "nationalPhoneNumber"]),
	);
	const rightPhone = normalizePhone(
		firstString(right, ["phone", "phone_number", "nationalPhoneNumber"]),
	);
	if (leftPhone && rightPhone && leftPhone === rightPhone) return true;
	for (const key of [
		"instagram_url",
		"instagramUrl",
		"facebook_url",
		"facebookUrl",
		"tiktok_url",
		"tiktokUrl",
		"linkedin_url",
		"linkedinUrl",
	]) {
		const leftUrl = firstUrl(left, [key]);
		const rightUrl = firstUrl(right, [key]);
		if (leftUrl && rightUrl && leftUrl === rightUrl) return true;
	}
	const leftName = comparableName(firstString(left, ["company_name", "name"]));
	const rightName = comparableName(
		firstString(right, ["company_name", "name"]),
	);
	if (!leftName || leftName !== rightName) return false;
	const leftCity = comparableName(firstString(left, ["city", "address"]));
	const rightCity = comparableName(firstString(right, ["city", "address"]));
	return !leftCity || !rightCity || leftCity === rightCity;
}

function domainFromCandidate(candidate: Candidate) {
	const raw = firstString(candidate, [
		"domain",
		"website",
		"websiteUri",
		"website_url",
	]);
	const value =
		raw && /^https?:\/\//i.test(raw) ? raw : raw && `https://${raw}`;
	if (!value) return null;
	try {
		return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return null;
	}
}

function comparableName(value: string | null) {
	return value
		?.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/\b(tiktok|instagram|facebook|youtube)\b.*$/i, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function isDiscoveryNoiseCandidate(candidate: Candidate) {
	const name = firstString(candidate, [
		"company_name",
		"companyName",
		"business_name",
		"businessName",
		"name",
		"displayName",
	]);
	const category = firstString(candidate, ["category", "industry", "niche"]);
	const text = `${name ?? ""} ${category ?? ""}`.toLowerCase();
	return (
		/\b(tiktok|instagram|facebook|youtube|google maps|make your day|official app|support center)\b/i.test(
			text,
		) ||
		/^(sin nombre|candidato sin nombre|untitled|test|demo)$/i.test(
			name?.trim() ?? "",
		)
	);
}

function isFootballMobileCandidate(candidate: Candidate) {
	const text = [
		firstString(candidate, ["company_name", "name", "displayName"]),
		firstString(candidate, ["category", "industry", "niche"]),
		...(Array.isArray(candidate.categories)
			? candidate.categories.filter(
					(item): item is string => typeof item === "string",
				)
			: []),
	]
		.filter(Boolean)
		.join(" ");
	const footballSignal =
		/f[uú]tbol|camiseta|uniforme|deportiv|soccer|jersey|tienda de ropa|ropa deportiva|sports? store/i.test(
			text,
		);
	if (isDiscoveryNoiseCandidate(candidate) || !footballSignal) return false;
	const phone = normalizePhone(
		firstString(candidate, [
			"phone",
			"phone_number",
			"nationalPhoneNumber",
			"internationalPhoneNumber",
		]) ?? firstString(nestedContact(candidate), ["phone", "phone_number"]),
	);
	const hasMobile = Boolean(phone?.startsWith("+573"));
	const hasWhatsAppLink = Boolean(
		firstWhatsApp(candidate, nestedContact(candidate)),
	);
	if (!hasMobile && !hasWhatsAppLink) return false;
	const rating = candidate.rating;
	if (typeof rating === "number" && rating < 3.5) return false;
	const reviewCount = candidate.userRatingCount;
	return !(typeof reviewCount === "number" && reviewCount < 3);
}

function isHighQualityFootballLead(candidate: Candidate) {
	// The campaign is gap-based, not category-only. A famous club or a polished
	// store can match every football keyword while being commercially useless to
	// Braxel. Keep only companies for which at least one sellable gap is visible.
	const website = firstUrl(candidate, [
		"website",
		"websiteUri",
		"website_url",
		"owned_website",
	]);
	const socialOnlyUrl = Boolean(website && isSocialOrMessagingUrl(website));

	if (!isFootballMobileCandidate(candidate)) return false;
	// The campaign is intended for actionable WhatsApp outreach. Keep only
	// Colombian mobile numbers or explicit WhatsApp links; fixed lines and
	// malformed values are not useful contact records. A mobile number remains
	// "WhatsApp por verificar" until an approved provider/API confirms it.
	// A social profile or Maps listing is not an owned website. Those candidates
	// remain useful, especially when they expose a WhatsApp link.
	if (!website || socialOnlyUrl) return true;

	const hasWhatsApp = hasExplicitWhatsAppEvidence(candidate);
	const hasCommerce = hasCommerceEvidence(candidate);
	const hasCheckout = hasCheckoutEvidence(candidate);
	const hasAutomation = hasWhatsAppAutomationEvidence(candidate);

	// Exclude only the exact failure mode reported by the user (Pro Champions,
	// Millonarios, etc.): owned site + real commerce/checkout + explicit evidence
	// that WhatsApp/cart automation is already running. A store with ecommerce,
	// WhatsApp and no automation evidence is still a valid cart-recovery lead.
	if (hasWhatsApp && (hasCommerce || hasCheckout) && hasAutomation)
		return false;

	// A website is not automatically disqualifying. Keep a real gap for a CRO,
	// ecommerce build, or WhatsApp/cart-recovery offer when one component is
	// visibly missing.
	return !hasCommerce || !hasWhatsApp || !hasCheckout || !hasAutomation;
}

function candidateEvidenceText(candidate: Candidate) {
	const keys = [
		"website_text",
		"websiteText",
		"description",
		"company_description",
		"research_summary",
		"pain_hypothesis",
		"evidence",
		"technologies",
		"technology_signals",
		"ecommerce_platform",
		"platform",
		"features",
		"services",
		"whatsapp_links",
		"social_links",
		"public_links",
	];
	return keys
		.map((key) => {
			const value = candidate[key];
			if (value == null) return "";
			try {
				return typeof value === "string" ? value : JSON.stringify(value);
			} catch {
				return "";
			}
		})
		.join(" ")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, " ");
}

function hasExplicitWhatsAppEvidence(candidate: Candidate) {
	if (firstWhatsApp(candidate, nestedContact(candidate))) return true;
	const text = candidateEvidenceText(candidate);
	return /wa\.me|whatsapp\.com|whatsapp link|enlace de whatsapp/.test(text);
}

function hasCommerceEvidence(candidate: Candidate) {
	const text = candidateEvidenceText(candidate);
	return Boolean(
		firstString(candidate, ["ecommerce_platform", "commerce_platform"]) ||
			/e[ -]?commerce|tienda online|tienda en linea|catalogo|catalogo online|shopify|woocommerce|prestashop|productos en venta/.test(
				text,
			),
	);
}

function hasCheckoutEvidence(candidate: Candidate) {
	const text = candidateEvidenceText(candidate);
	return /carrito|checkout|pagar|pago online|comprar ahora|add to cart|añadir al carrito|pasarela de pago|mercadopago|payu|wompi/.test(
		text,
	);
}

function hasWhatsAppAutomationEvidence(candidate: Candidate) {
	const text = candidateEvidenceText(candidate);
	return /carrito abandonado|recuperar carrito|abandoned cart|automatiz.*whatsapp|chatbot|bot de whatsapp|respuestas automaticas|remarketing.*whatsapp/.test(
		text,
	);
}

function isSocialOrMessagingUrl(value: string) {
	return Boolean(
		socialProfileUrl(
			value,
			"facebook.com",
			"instagram.com",
			"tiktok.com",
			"wa.me",
			"whatsapp.com",
		),
	);
}

function socialProfileUrl(value: string | null, ...domains: string[]) {
	if (!value) return null;
	try {
		const hostname = new URL(value).hostname.toLowerCase();
		return domains.some(
			(domain) => hostname === domain || hostname.endsWith(`.${domain}`),
		)
			? value
			: null;
	} catch {
		return null;
	}
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
		// `url` in Maps-like payloads is commonly the place/profile URL, not an
		// owned website. Treat only explicit website fields as a domain signal.
		website: firstUrl(row, ["website", "websiteUri", "website_url"]),
		phone: normalizePhone(
			firstString(row, [
				"phone",
				"contact_phone",
				"phone_number",
				"nationalPhoneNumber",
				"internationalPhoneNumber",
			]),
		),
		categories: Array.isArray(row.categories)
			? row.categories
			: Array.isArray(row.types)
				? row.types
				: [],
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
	for (const key of ["company_name", "phone", "city", "source_url"]) {
		if (base[key] != null && base[key] !== "") merged[key] = base[key];
	}
	for (const key of [
		"website",
		"email",
		"whatsapp_url",
		"instagram_url",
		"facebook_url",
		"tiktok_url",
		"linkedin_url",
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

function firstPublicContactValue(row: Candidate, key: "emails" | "phones") {
	const publicContact = row.public_contact;
	if (!isRecord(publicContact)) return null;
	const values = publicContact[key];
	const candidates = Array.isArray(values) ? values : [values];
	for (const value of candidates) {
		if (typeof value !== "string" || !value.trim()) continue;
		const normalized = value.trim();
		if (key === "emails" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
			return normalized.toLowerCase();
		if (key === "phones") return normalized;
	}
	return null;
}

function socialUrlFromEvidence(row: Candidate, network: string) {
	const direct = firstUrl(row, [
		`${network}_url`,
		`${network}Url`,
		`${network}_profile`,
	]);
	if (direct) return direct;

	for (const key of [
		"social_links",
		"socialLinks",
		"public_links",
		"contact_channels",
	]) {
		const values = row[key];
		if (!Array.isArray(values)) continue;
		for (const item of values) {
			if (!isRecord(item)) continue;
			const label = firstString(item, [
				"network",
				"type",
				"platform",
			])?.toLowerCase();
			const url = firstUrl(item, ["url", "value", "href", "link"]);
			if (!url) continue;
			try {
				const host = new URL(url).hostname.toLowerCase();
				if (
					label?.includes(network) ||
					host === `${network}.com` ||
					host.endsWith(`.${network}.com`)
				)
					return url;
			} catch {
				// Ignore malformed evidence; it must never become a CRM link.
			}
		}
	}
	return null;
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
		]) ??
		firstWhatsAppFromEvidence(row);
	if (!value || !/^https?:\/\//i.test(value)) return null;
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

function firstWhatsAppFromEvidence(row: Candidate) {
	const publicContact = row.public_contact;
	if (isRecord(publicContact)) {
		for (const key of ["whatsapp_urls", "whatsappUrls"]) {
			const values = publicContact[key];
			const first = Array.isArray(values) ? values[0] : values;
			if (typeof first === "string" && first.trim()) return first.trim();
		}
	}
	for (const key of ["contact_methods", "contactMethods", "contact_channels"]) {
		const values = row[key];
		if (!Array.isArray(values)) continue;
		for (const item of values) {
			if (!isRecord(item)) continue;
			const type = firstString(item, [
				"type",
				"network",
				"platform",
			])?.toLowerCase();
			const value = firstUrl(item, ["value", "url", "href", "link"]);
			if (value && type?.includes("whatsapp")) return value;
		}
	}
	return null;
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
