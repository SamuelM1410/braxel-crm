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
			providers: { scrapegraph },
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
		if (!this.scrapegraphUrl()) {
			throw new BadRequestException(
				"ScrapeGraphAI no está configurado. Define SCRAPEGRAPH_URL (por defecto http://127.0.0.1:8011) en el API.",
			);
		}
		const target = input.query.trim() || this.scrapegraphTarget();
		if (!target) {
			throw new BadRequestException(
				"Configura SCRAPEGRAPH_DEFAULT_URL o introduce una URL pública para investigar.",
			);
		}

		const run = await this.db.scraperRun.create({
			data: {
				provider: input.provider,
				query: target,
				createdById: userId,
			},
			select: RUN_SELECT,
		});

		try {
			const candidates = await this.runScrapeGraph(target, input.limit);
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

	private scrapegraphUrl() {
		return (
			this.config.get<string>("SCRAPEGRAPH_URL")?.trim().replace(/\/$/, "") ||
			"http://127.0.0.1:8011"
		);
	}

	private scrapegraphTarget() {
		return this.config.get<string>("SCRAPEGRAPH_DEFAULT_URL")?.trim() || null;
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
		const response = await fetch(`${this.scrapegraphUrl()}/research`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ url: target }),
			signal: AbortSignal.timeout(300_000),
		});
		if (!response.ok)
			throw new Error(`ScrapeGraphAI devolvió HTTP ${response.status}.`);
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
	if (/^https?:\/\//i.test(value)) return value;
	const digits = value.replace(/[^\d]/g, "");
	return digits.length >= 7 ? `https://wa.me/${digits}` : null;
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
