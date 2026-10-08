import {
	type Db,
	type EnrichmentStatus,
	type Prisma,
	Prisma as PrismaNamespace,
	type RecordSource,
} from "@crm/db";
import { OPEN_DEAL_STAGES } from "@crm/db/deal-stage";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentQueueService } from "../agent/agent-queue.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import {
	ActivityStampService,
	type StampTargets,
} from "../crm/activity-stamp.service";
import { type BulkResult, requireOwner, runBulk } from "../crm/bulk";
import {
	blankToNull,
	normalizeEmail,
	normalizePhone,
	normalizeWhatsAppUrl,
	toCents,
} from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import {
	countsByKey,
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	ownerFilter,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	CompanyBulkOwnerInput,
	CompanyCreateInput,
	CompanyListInput,
	CompanyUpdateInput,
} from "./companies.contracts";
import { normalizeDomain } from "./domain";
import { FaviconService } from "./favicon.service";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

export type CompanyRow = {
	id: string;
	name: string;
	description: string | null;
	domain: string | null;
	iconUrl: string | null;
	iconDarkUrl: string | null;
	iconTone: string | null;
	logoUrl: string | null;
	brandColor: string | null;
	industry: string | null;
	enrichmentStatus: EnrichmentStatus;
	queued: boolean;
	source: RecordSource;
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	contactCount: number;
	openDealCount: number;
	lastActivityAt: string | null;
	createdAt: string;
	fields: Record<string, string | number | boolean | null>;
	leadOs: LeadOsListMeta | null;
	channel: CompanyChannelMeta;
};

export type CompanyChannelKind = "WHATSAPP" | "PHONE" | "EMAIL" | "RESEARCH";

export type CompanyChannelMeta = {
	kind: CompanyChannelKind;
	hasWhatsApp: boolean;
	highPriority: boolean;
};

type LeadOsListMeta = {
	stage: string;
	fit: LeadFit;
	reviewStatus: string;
	evidenceScore: number;
	opportunityScore: number;
	priorityScore: number;
	recommendedOffer: string | null;
};

type LeadFit = "STRONG_FIT" | "POTENTIAL_FIT" | "NEEDS_RESEARCH" | "NO_FIT";

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.CompanyOrderByWithRelationInput
> = {
	name: (dir) => ({ name: dir }),
	domain: (dir) => ({ domain: dir }),
	industry: (dir) => ({ industry: dir }),
	createdAt: (dir) => ({ createdAt: dir }),
	contacts: (dir) => ({ contacts: { _count: dir } }),
	deals: (dir) => ({ deals: { _count: dir } }),
	owner: (dir) => ({ owner: { name: dir } }),
	lastActivity: (dir) => ({ lastActivityAt: { sort: dir, nulls: "last" } }),
};

@Injectable()
export class CompaniesService {
	private readonly logger = new Logger(CompaniesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly queue: AgentQueueService,
		private readonly favicon: FaviconService,
		private readonly stamp: ActivityStampService,
		private readonly conversion: ConversionService,
		private readonly fields: FieldsService,
	) {}

	async list(input: CompanyListInput): Promise<ListResult<CompanyRow>> {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);
		const prioritizedLeadView = input.sort === "";
		const fitFilteredView = input.fit !== FACET_ALL;
		const localLeadView = prioritizedLeadView || fitFilteredView;

		const [rows, total, facetCounts] = await Promise.all([
			this.db.company.findMany({
				where,
				skip: localLeadView ? undefined : skip,
				take: localLeadView ? undefined : take,
				orderBy: resolveOrderBy(input, SORTABLE, {
					createdAt: "desc",
				}),
				select: {
					id: true,
					name: true,
					description: true,
					domain: true,
					iconUrl: true,
					iconDarkUrl: true,
					iconTone: true,
					logoUrl: true,
					brandColor: true,
					industry: true,
					phone: true,
					email: true,
					whatsappUrl: true,
					enrichmentStatus: true,
					source: true,
					owner: { select: OWNER_SELECT },
					_count: {
						select: {
							contacts: true,
							deals: { where: { stage: { in: [...OPEN_DEAL_STAGES] } } },
						},
					},
					lastActivityAt: true,
					createdAt: true,
				},
			}),
			this.db.company.count({ where }),
			this.facetCounts(input),
		]);

		const fitRows = rows.filter((row) =>
			matchesLeadFit(leadOsListMeta(row.description), input.fit),
		);
		const orderedRows = prioritizedLeadView
			? [...fitRows].sort((left, right) => {
					const rightRank = companyPriorityRank(right);
					const leftRank = companyPriorityRank(left);
					return rightRank - leftRank || left.name.localeCompare(right.name);
				})
			: fitRows;
		const visibleRows = localLeadView
			? orderedRows.slice(skip, skip + take)
			: orderedRows;
		const ids = visibleRows.map((row) => row.id);
		const [queued, tableFields] = await Promise.all([
			this.queue.queuedCompanies(ids),
			this.fields.tableValuesFor("COMPANY", ids),
		]);

		return {
			rows: visibleRows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description,
				domain: row.domain,
				iconUrl: row.iconUrl,
				iconDarkUrl: row.iconDarkUrl,
				iconTone: row.iconTone,
				logoUrl: row.logoUrl,
				brandColor: row.brandColor,
				industry: row.industry,
				enrichmentStatus: row.enrichmentStatus,
				queued: queued.has(row.id),
				source: row.source,
				owner: row.owner,
				contactCount: row._count.contacts,
				openDealCount: row._count.deals,
				lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
				createdAt: row.createdAt.toISOString(),
				fields: tableFields.get(row.id) ?? {},
				leadOs: leadOsListMeta(row.description),
				channel: companyChannelMeta(row),
			})),
			total: localLeadView ? orderedRows.length : total,
			facetCounts: {
				...facetCounts,
				fit: fitCounts(rows),
			},
		};
	}

	async byId(id: string) {
		const company = await this.db.company.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				domain: true,
				website: true,
				description: true,
				logoUrl: true,
				logoDarkUrl: true,
				iconUrl: true,
				iconDarkUrl: true,
				iconTone: true,
				brandColor: true,
				industry: true,
				subIndustry: true,
				city: true,
				stateCode: true,
				country: true,
				countryCode: true,
				phone: true,
				email: true,
				linkedinUrl: true,
				twitterUrl: true,
				githubUrl: true,
				instagramUrl: true,
				facebookUrl: true,
				tiktokUrl: true,
				whatsappUrl: true,
				salesStage: true,
				preferredContactChannel: true,
				firstCallOutcome: true,
				outreachApprovedAt: true,
				emailAssistantEnabled: true,
				emailAssistantEnabledAt: true,
				emailAssistantLastReplyAt: true,
				nextSalesActionAt: true,
				salesNotes: true,
				pricingUrl: true,
				careersUrl: true,
				enrichmentStatus: true,
				enrichedAt: true,
				enrichmentError: true,
				source: true,
				createdAt: true,
				owner: { select: OWNER_SELECT },
				primaryContact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						phone: true,
						title: true,
					},
				},
				contacts: {
					orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						title: true,
						imageUrl: true,
						owner: { select: OWNER_SELECT },
					},
				},
				deals: {
					orderBy: [{ stage: "asc" }, { expectedCloseDate: "asc" }],
					select: {
						id: true,
						name: true,
						stage: true,
						amount: true,
						currency: true,
						baseAmount: true,
						expectedCloseDate: true,
						owner: { select: OWNER_SELECT },
					},
				},
			},
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		const {
			deals,
			primaryContact,
			enrichedAt,
			createdAt,
			nextSalesActionAt,
			...rest
		} = company;

		return {
			...rest,
			phone: normalizePhone(rest.phone),
			whatsappUrl: normalizeWhatsAppUrl(rest.whatsappUrl),
			fields: await this.fields.valuesFor("COMPANY", id),
			queued: await this.queue.isQueued({ companyId: id }),
			createdAt: createdAt.toISOString(),
			enrichedAt: enrichedAt?.toISOString() ?? null,
			nextSalesActionAt: nextSalesActionAt?.toISOString() ?? null,
			primaryContactId: primaryContact?.id ?? null,
			primaryContact: primaryContact
				? { ...primaryContact, phone: normalizePhone(primaryContact.phone) }
				: null,
			reportingCurrency: await this.conversion.reportingCurrency(),
			deals: deals.map((deal) => ({
				...deal,
				amount: undefined,
				baseAmount: undefined,
				amountCents: toCents(deal.amount),
				baseAmountCents: toCents(deal.baseAmount),
				expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			})),
		};
	}

	async options(q: string) {
		return this.db.company.findMany({
			where: this.searchFilter(q),
			select: { id: true, name: true, domain: true, iconUrl: true },
			orderBy: { name: "asc" },
			take: 100,
		});
	}

	/** Channel coverage for the workspace's company records. */
	async coverage() {
		const [
			total,
			phone,
			whatsappUrl,
			whatsappReady,
			email,
			instagram,
			facebook,
			tiktok,
			linkedin,
		] = await Promise.all([
			this.db.company.count(),
			this.db.company.count({ where: { phone: { not: null } } }),
			this.db.company.count({ where: { whatsappUrl: { not: null } } }),
			this.db.company.count({
				where: {
					OR: [{ phone: { not: null } }, { whatsappUrl: { not: null } }],
				},
			}),
			this.db.company.count({ where: { email: { not: null } } }),
			this.db.company.count({ where: { instagramUrl: { not: null } } }),
			this.db.company.count({ where: { facebookUrl: { not: null } } }),
			this.db.company.count({ where: { tiktokUrl: { not: null } } }),
			this.db.company.count({ where: { linkedinUrl: { not: null } } }),
		]);
		const percentage = (count: number) =>
			total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
		return {
			total,
			phone: { count: phone, percentage: percentage(phone) },
			whatsappUrl: { count: whatsappUrl, percentage: percentage(whatsappUrl) },
			whatsappReady: {
				count: whatsappReady,
				percentage: percentage(whatsappReady),
			},
			email: { count: email, percentage: percentage(email) },
			instagram: { count: instagram, percentage: percentage(instagram) },
			facebook: { count: facebook, percentage: percentage(facebook) },
			tiktok: { count: tiktok, percentage: percentage(tiktok) },
			linkedin: { count: linkedin, percentage: percentage(linkedin) },
		};
	}

	async create(input: CompanyCreateInput) {
		const domain = normalizeDomain(input.domain);

		if (domain) {
			const existing = await this.db.company.findUnique({
				where: { domain },
				select: { id: true, name: true },
			});
			if (existing) {
				throw new ConflictException(
					`${existing.name} already uses the domain ${domain}.`,
				);
			}
		}

		const company = await this.agent.withCrmEvents(async (tx, emit) => {
			const created = await tx.company.create({
				data: {
					name: input.name.trim(),
					domain,
					website: domain ? `https://${domain}` : null,
					ownerId: input.ownerId ?? null,
				},
				select: { id: true, name: true, domain: true, createdAt: true },
			});
			await emit({
				type: "company.created",
				record: { kind: "company", id: created.id },
				occurredAt: created.createdAt,
				data: { name: created.name, domain: created.domain },
			});
			return created;
		});

		this.logger.log({
			message: "Company created",
			companyId: company.id,
			domain: company.domain,
		});

		await this.agent.companyCreated(company.id);

		void this.favicon.backfill(company.id, company.domain);

		return { id: company.id, name: company.name, domain: company.domain };
	}

	async update(id: string, input: CompanyUpdateInput, actingUserId?: string) {
		const data: Prisma.CompanyUpdateInput = {};

		if (input.name !== undefined) data.name = input.name.trim();
		if (input.website !== undefined) data.website = blankToNull(input.website);
		if (input.description !== undefined) {
			data.description = blankToNull(input.description);
		}
		if (input.industry !== undefined)
			data.industry = blankToNull(input.industry);
		if (input.city !== undefined) data.city = blankToNull(input.city);
		if (input.stateCode !== undefined) {
			data.stateCode = blankToNull(input.stateCode);
		}
		if (input.country !== undefined) data.country = blankToNull(input.country);
		if (input.phone !== undefined) data.phone = normalizePhone(input.phone);
		if (input.email !== undefined) data.email = blankToNull(input.email);
		if (input.linkedinUrl !== undefined) {
			data.linkedinUrl = blankToNull(input.linkedinUrl);
		}
		if (input.instagramUrl !== undefined)
			data.instagramUrl = blankToNull(input.instagramUrl);
		if (input.facebookUrl !== undefined)
			data.facebookUrl = blankToNull(input.facebookUrl);
		if (input.tiktokUrl !== undefined)
			data.tiktokUrl = blankToNull(input.tiktokUrl);
		if (input.whatsappUrl !== undefined)
			data.whatsappUrl = normalizeWhatsAppUrl(input.whatsappUrl);
		if (input.salesStage !== undefined) data.salesStage = input.salesStage;
		if (input.preferredContactChannel !== undefined) {
			data.preferredContactChannel = input.preferredContactChannel;
		}
		if (input.firstCallOutcome !== undefined) {
			data.firstCallOutcome = blankToNull(input.firstCallOutcome);
		}
		if (input.salesNotes !== undefined)
			data.salesNotes = blankToNull(input.salesNotes);
		if (input.nextSalesActionAt !== undefined) {
			data.nextSalesActionAt = input.nextSalesActionAt
				? new Date(input.nextSalesActionAt)
				: null;
		}
		if (input.outreachApproved !== undefined) {
			data.outreachApprovedAt = input.outreachApproved ? new Date() : null;
			data.outreachApprovedById = input.outreachApproved
				? (actingUserId ?? null)
				: null;
		}
		if (input.ownerId !== undefined) {
			data.owner = input.ownerId
				? { connect: { id: input.ownerId } }
				: { disconnect: true };
		}

		if (input.domain !== undefined) {
			const domain = normalizeDomain(input.domain);
			if (input.domain.trim() && !domain) {
				throw new BadRequestException(
					`"${input.domain}" is not a domain — try something like "stripe.com".`,
				);
			}
			data.domain = domain;
			const current = await this.db.company.findUnique({
				where: { id },
				select: { domain: true },
			});
			if (current && current.domain !== domain) {
				data.enrichmentStatus = "PENDING";
				data.enrichmentError = null;
				data.iconUrl = null;
				data.iconDarkUrl = null;
				data.iconTone = null;
			}
		}

		try {
			const updated = await this.db.$transaction(async (tx) => {
				if (input.fields) {
					await this.fields.applyValues(tx, "COMPANY", id, input.fields);
				}

				return tx.company.update({
					where: { id },
					data,
					select: { id: true, name: true, domain: true },
				});
			});

			if (data.enrichmentStatus === "PENDING") {
				await this.agent.companyCreated(
					id,
					"Domain changed — anything we knew was about a different company",
				);
				void this.favicon.backfill(id, updated.domain);
			}

			return updated;
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async delete(id: string): Promise<{ id: string; name: string }> {
		let deleted: { targets: StampTargets; name: string };

		try {
			deleted = await this.db.$transaction(async (tx) => {
				const targets = await this.stamp.targetsOf(
					{ OR: [{ companyId: id }, { deal: { companyId: id } }] },
					tx,
				);

				await tx.agentTask.deleteMany({ where: { companyId: id } });

				const company = await tx.company.delete({
					where: { id },
					select: { name: true },
				});

				return { targets, name: company.name };
			});
		} catch (error) {
			throw this.translate(error, id);
		}

		await this.stamp.recomputeAfterDelete(deleted.targets, { companyId: id });

		this.logger.log({
			message: "Company deleted",
			companyId: id,
			name: deleted.name,
		});

		return { id, name: deleted.name };
	}

	async bulkAssignOwner(input: CompanyBulkOwnerInput): Promise<BulkResult> {
		const ownerId = input.ownerId || null;

		await requireOwner(this.db, ownerId);

		const ids = [...new Set(input.ids)];
		const { count } = await this.db.company.updateMany({
			where: { id: { in: ids } },
			data: { ownerId },
		});

		this.logger.log({
			message: "Companies reassigned",
			count,
			ownerId,
		});

		return {
			requested: ids.length,
			succeeded: count,
			failed: ids.length - count,
			message: null,
		};
	}

	async bulkEnrich(ids: string[]): Promise<BulkResult> {
		return runBulk(ids, (id) => this.enrich(id));
	}

	async bulkDelete(ids: string[]): Promise<BulkResult> {
		return runBulk(ids, (id) => this.delete(id));
	}

	async enrich(id: string): Promise<{ id: string; queued: boolean }> {
		const company = await this.db.company.findUnique({
			where: { id },
			select: { id: true },
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		await this.db.company.update({
			where: { id },
			data: { enrichmentStatus: "PENDING", enrichmentError: null },
		});
		await this.agent.companyRequested(id, "A rep asked for a fresh look");

		return { id, queued: true };
	}

	async research(id: string, actingUserId: string) {
		const company = await this.db.company.findUnique({
			where: { id },
			select: { id: true, domain: true },
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		if (!company.domain) {
			throw new BadRequestException(
				"There is nothing to read without a domain — add one first.",
			);
		}

		await this.agent.companyRequested(
			id,
			`Briefing requested by a rep (${actingUserId})`,
		);

		return { ok: true as const, queued: true as const };
	}

	async setPrimaryContact(companyId: string, contactId: string | null) {
		if (contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: contactId },
				select: { companyId: true },
			});
			if (!contact) {
				throw new NotFoundException(`No contact with id ${contactId}.`);
			}
			if (contact.companyId !== companyId) {
				throw new BadRequestException(
					"That contact does not work at this company.",
				);
			}
		}

		try {
			return await this.db.company.update({
				where: { id: companyId },
				data: { primaryContactId: contactId },
				select: { id: true, primaryContactId: true },
			});
		} catch (error) {
			throw this.translate(error, companyId);
		}
	}

	private searchFilter(q: string): Prisma.CompanyWhereInput {
		const term = q.trim();
		if (!term) return {};

		return {
			OR: [
				{ name: { contains: term, mode: "insensitive" } },
				{ domain: { contains: term, mode: "insensitive" } },
			],
		};
	}

	private buildWhere(input: CompanyListInput): Prisma.CompanyWhereInput {
		const where: Prisma.CompanyWhereInput = {
			...this.searchFilter(input.q),
			...ownerFilter(input.owner),
		};

		if (input.industry !== FACET_ALL) {
			where.industry = input.industry;
		}

		if (input.enrichment !== FACET_ALL) {
			where.enrichmentStatus = input.enrichment as EnrichmentStatus;
		}

		if (input.source !== FACET_ALL) {
			where.source = input.source as RecordSource;
		}

		return where;
	}

	private async facetCounts(input: CompanyListInput) {
		const where = this.searchFilter(input.q);

		const [owners, industries, enrichment, sources] = await Promise.all([
			this.db.company.groupBy({
				by: ["ownerId"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["industry"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["enrichmentStatus"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["source"],
				where,
				_count: { _all: true },
			}),
		]);

		return {
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			industry: countsByKey(industries, "industry"),
			enrichment: countsByKey(enrichment, "enrichmentStatus"),
			source: countsByKey(sources, "source"),
		};
	}

	private translate(error: unknown, id: string): unknown {
		if (error instanceof PrismaNamespace.PrismaClientKnownRequestError) {
			if (error.code === "P2025") {
				return new NotFoundException(`No company with id ${id}.`);
			}
			if (error.code === "P2002") {
				return new ConflictException(
					"Another company already uses that domain.",
				);
			}
		}
		return error;
	}
}

function leadOsRank(description: string | null) {
	const lead = leadOsListMeta(description);
	if (!lead) return -1;
	const inactive =
		lead.reviewStatus === "REJECTED" ||
		lead.stage === "DISQUALIFIED" ||
		lead.fit === "NO_FIT";
	if (inactive) return 0;
	const fitBonus =
		lead.fit === "STRONG_FIT" ? 3 : lead.fit === "POTENTIAL_FIT" ? 1 : 0;
	const reviewBonus =
		lead.stage === "REVIEW_REQUIRED" && lead.reviewStatus === "PENDING"
			? 2
			: lead.reviewStatus === "APPROVED"
				? 1
				: 0;
	return (
		lead.priorityScore * 1_000_000 +
		lead.opportunityScore * 10_000 +
		lead.evidenceScore * 100 +
		fitBonus * 10 +
		reviewBonus
	);
}

type CompanyChannelSource = {
	name: string;
	phone: string | null;
	email: string | null;
	whatsappUrl: string | null;
	description: string | null;
};

/**
 * Keep the first-touch queue honest: an ordinary phone number is not silently
 * treated as WhatsApp. A record only receives the WhatsApp category when its
 * explicit wa.me/WhatsApp URL passes the same validation used on write/read.
 */
function companyChannelMeta(row: CompanyChannelSource): CompanyChannelMeta {
	const whatsapp = normalizeWhatsAppUrl(row.whatsappUrl);
	const phone = normalizePhone(row.phone);
	const email = normalizeEmail(row.email ?? "");
	const lead = leadOsListMeta(row.description);

	if (whatsapp) {
		return {
			kind: "WHATSAPP",
			hasWhatsApp: true,
			highPriority:
				lead?.fit === "STRONG_FIT" && (lead.priorityScore ?? 0) >= 70,
		};
	}
	if (phone) return { kind: "PHONE", hasWhatsApp: false, highPriority: false };
	if (email) return { kind: "EMAIL", hasWhatsApp: false, highPriority: false };
	return { kind: "RESEARCH", hasWhatsApp: false, highPriority: false };
}

function companyPriorityRank(row: CompanyChannelSource) {
	const channel = companyChannelMeta(row);
	const channelRank =
		channel.kind === "WHATSAPP"
			? 4
			: channel.kind === "PHONE"
				? 3
				: channel.kind === "EMAIL"
					? 2
					: 1;
	return channelRank * 1_000_000_000_000 + leadOsRank(row.description);
}

function leadOsListMeta(description: string | null): LeadOsListMeta | null {
	if (!description?.includes("Lead OS source:")) return null;
	const line = (label: string) =>
		description.match(new RegExp(`^${label}:\\s*(.+)$`, "m"))?.[1]?.trim() ??
		"";
	const dossierLine = description
		.split("\n")
		.find((value) => value.startsWith("Dossier Lead OS: "));
	if (dossierLine) {
		try {
			const dossier = JSON.parse(
				dossierLine.slice("Dossier Lead OS: ".length),
			) as {
				classification?: { status?: string; fit?: string };
				scores?: {
					evidence_quality?: number;
					commercial_opportunity?: number;
					contact_priority?: number;
				};
				commercial_assessment?: { recommended_offer?: string };
			};
			const stage =
				line("Etapa Lead OS") || dossier.classification?.status || "RESEARCHED";
			const reviewStatus = line("Revisión") || "PENDING";
			return {
				stage,
				fit: resolveLeadFit(dossier.classification?.fit, stage, reviewStatus),
				reviewStatus,
				evidenceScore: dossier.scores?.evidence_quality ?? 0,
				opportunityScore: dossier.scores?.commercial_opportunity ?? 0,
				priorityScore: dossier.scores?.contact_priority ?? 0,
				recommendedOffer: normalizeCommercialOffer(
					dossier.commercial_assessment?.recommended_offer ?? null,
				),
			};
		} catch {}
	}
	const score = Number(line("Score").match(/\d+/)?.[0] ?? 0);
	const stage = line("Etapa Lead OS") || "REVIEW_REQUIRED";
	const reviewStatus = line("Revisión") || "PENDING";
	return {
		stage,
		fit: resolveLeadFit(null, stage, reviewStatus),
		reviewStatus,
		evidenceScore: score,
		opportunityScore: score,
		priorityScore: score,
		recommendedOffer: normalizeCommercialOffer(
			line("Oferta recomendada") || legacyOffer(line("Dolor")),
		),
	};
}

function resolveLeadFit(
	value: string | null | undefined,
	stage: string,
	reviewStatus: string,
): LeadFit {
	if (stage === "DISQUALIFIED" || reviewStatus === "REJECTED") return "NO_FIT";
	if (value === "STRONG_FIT" || value === "POTENTIAL_FIT" || value === "NO_FIT")
		return value;
	return "NEEDS_RESEARCH";
}

function matchesLeadFit(
	lead: LeadOsListMeta | null,
	view: CompanyListInput["fit"],
) {
	if (view === FACET_ALL) return true;
	if (!lead) return false;
	if (view === "strong") return lead.fit === "STRONG_FIT";
	if (view === "potential") return lead.fit === "POTENTIAL_FIT";
	if (view === "research") return lead.fit === "NEEDS_RESEARCH";
	return lead.fit === "NO_FIT";
}

function fitCounts(rows: CompanyChannelSource[]) {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		const fit = leadOsListMeta(row.description)?.fit ?? "NEEDS_RESEARCH";
		const key =
			fit === "STRONG_FIT"
				? "strong"
				: fit === "POTENTIAL_FIT"
					? "potential"
					: fit === "NO_FIT"
						? "excluded"
						: "research";
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

function legacyOffer(problem: string) {
	const normalized = problem.toLowerCase();
	if (normalized.includes("sin web") || normalized.includes("no tiene web"))
		return "Web de conversión + WhatsApp";
	if (
		normalized.includes("web") &&
		(normalized.includes("lenta") || normalized.includes("antigua"))
	)
		return "Rediseño web orientado a conversión";
	if (normalized.includes("seguimiento") || normalized.includes("agenda"))
		return "Aplicación web a medida";
	return problem ? "Diagnóstico comercial y automatización por fases" : null;
}

function normalizeCommercialOffer(value: string | null) {
	if (!value) return null;
	const label =
		{
			CONVERSION_WEBSITE: "Páginas web que convierten",
			WEB_APP_CUSTOM: "Aplicaciones web a medida",
			ECOMMERCE_STORE: "Tiendas online para ecommerce",
			CRO_REDESIGN: "Rediseño y CRO",
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
		return "Aplicación web a medida";
	if (
		normalized.includes("web de conversión") ||
		normalized.includes("web de conversion")
	)
		return "Páginas web que convierten";
	return label;
}
