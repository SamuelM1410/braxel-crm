import { type Db, RecordSource } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { LeadOsDossier } from "./lead-os-dossier";

type IntakeLead = {
	sourceId: string;
	companyName: string;
	websiteUrl?: string | null;
	city?: string | null;
	niche?: string | null;
	phone?: string | null;
	email?: string | null;
	instagramUrl?: string | null;
	facebookUrl?: string | null;
	tiktokUrl?: string | null;
	whatsappUrl?: string | null;
	contactName?: string | null;
	contactRole?: string | null;
	score?: number | null;
	recommendedOffer?: string | null;
	offerReason?: string | null;
	researchSummary?: string | null;
	painHypothesis?: string | null;
	reviewReason?: string | null;
	sourceUrl?: string | null;
	pipelineStage?: string | null;
	reviewStatus?: string | null;
	doNotContact?: boolean;
	dossier?: LeadOsDossier | null;
	updateOnly?: boolean;
};

@Injectable()
export class IntakeService {
	private readonly logger = new Logger(IntakeService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async import(leads: IntakeLead[]) {
		const results = [];
		for (const lead of leads) {
			results.push(await this.importLead(lead));
		}
		return { imported: results };
	}

	private async importLead(lead: IntakeLead) {
		const domain = domainFromUrl(lead.websiteUrl);
		const description = descriptionFor(lead);
		const company = await this.db.$transaction(async (tx) => {
			const imported = await tx.company.findFirst({
				where: { description: { startsWith: sourceMarker(lead.sourceId) } },
			});
			const existing =
				imported ??
				(domain
					? await tx.company.findUnique({ where: { domain } })
					: await tx.company.findFirst({
							where: { name: lead.companyName, phone: clean(lead.phone) },
						}));
			if (!existing && lead.updateOnly) return null;

			return existing
				? tx.company.update({
						where: { id: existing.id },
						data: companyData(lead, domain, description),
					})
				: tx.company.create({
						data: {
							name: lead.companyName,
							domain,
							website: clean(lead.websiteUrl),
							city: clean(lead.city),
							industry: clean(lead.niche),
						phone: clean(lead.phone),
						email: clean(lead.email),
						instagramUrl: clean(lead.instagramUrl),
						facebookUrl: clean(lead.facebookUrl),
						tiktokUrl: clean(lead.tiktokUrl),
						whatsappUrl: clean(lead.whatsappUrl),
						description,
							source: RecordSource.IMPORT,
							enrichmentStatus: "SKIPPED",
						},
					});
		});
		if (!company) {
			return {
				sourceId: lead.sourceId,
				companyId: null,
				contactId: null,
				skipped: true,
			};
		}

		const contact = await this.upsertContact(company.id, lead);
		this.logger.log({
			message: "Lead OS lead imported",
			companyId: company.id,
			contactId: contact?.id,
			sourceId: lead.sourceId,
		});

		return {
			sourceId: lead.sourceId,
			companyId: company.id,
			contactId: contact?.id ?? null,
		};
	}

	private async upsertContact(companyId: string, lead: IntakeLead) {
		const fullName = clean(lead.contactName);
		const email = normalizeEmail(lead.email);
		if (!fullName && !email) return null;

		const [firstName = "Contact", ...lastName] = (
			fullName ??
			email ??
			"Contact"
		).split(/\s+/);
		const contact = email
			? await this.db.contact.upsert({
					where: { email },
					update: {
						firstName,
						lastName: lastName.join(" ") || null,
						phone: clean(lead.phone),
						instagramUrl: clean(lead.instagramUrl),
						facebookUrl: clean(lead.facebookUrl),
						tiktokUrl: clean(lead.tiktokUrl),
						whatsappUrl: clean(lead.whatsappUrl),
						title: clean(lead.contactRole),
						source: RecordSource.IMPORT,
						enrichmentStatus: "SKIPPED",
					},
					create: {
						companyId,
						firstName,
						lastName: lastName.join(" ") || null,
						email,
						phone: clean(lead.phone),
						instagramUrl: clean(lead.instagramUrl),
						facebookUrl: clean(lead.facebookUrl),
						tiktokUrl: clean(lead.tiktokUrl),
						whatsappUrl: clean(lead.whatsappUrl),
						title: clean(lead.contactRole),
						source: RecordSource.IMPORT,
						enrichmentStatus: "SKIPPED",
					},
				})
			: ((await this.db.contact.findFirst({
					where: {
						companyId,
						firstName,
						lastName: lastName.join(" ") || null,
					},
				})) ??
				(await this.db.contact.create({
					data: {
						companyId,
						firstName,
						lastName: lastName.join(" ") || null,
						email,
						phone: clean(lead.phone),
						instagramUrl: clean(lead.instagramUrl),
						facebookUrl: clean(lead.facebookUrl),
						tiktokUrl: clean(lead.tiktokUrl),
						whatsappUrl: clean(lead.whatsappUrl),
						title: clean(lead.contactRole),
						source: RecordSource.IMPORT,
						enrichmentStatus: "SKIPPED",
					},
				})));

		if (contact.companyId === companyId) {
			await this.db.$transaction(async (tx) => {
				await tx.company.updateMany({
					where: { primaryContactId: contact.id, id: { not: companyId } },
					data: { primaryContactId: null },
				});
				await tx.company.update({
					where: { id: companyId },
					data: { primaryContactId: contact.id },
				});
			});
		}
		return contact;
	}
}

function companyData(
	lead: IntakeLead,
	domain: string | null,
	description: string,
) {
	return {
		name: lead.companyName,
		domain,
		website: clean(lead.websiteUrl),
		city: clean(lead.city),
		industry: clean(lead.niche),
		phone: clean(lead.phone),
		email: clean(lead.email),
		instagramUrl: clean(lead.instagramUrl),
		facebookUrl: clean(lead.facebookUrl),
		tiktokUrl: clean(lead.tiktokUrl),
		whatsappUrl: clean(lead.whatsappUrl),
		description,
		source: RecordSource.IMPORT,
		enrichmentStatus: "SKIPPED" as const,
	};
}

function descriptionFor(lead: IntakeLead) {
	return [
		sourceMarker(lead.sourceId),
		lead.score === null || lead.score === undefined
			? null
			: `Score: ${lead.score}/100`,
		lead.recommendedOffer
			? `Oferta recomendada: ${lead.recommendedOffer}`
			: null,
		lead.offerReason ? `Motivo de oferta: ${lead.offerReason}` : null,
		lead.pipelineStage ? `Etapa Lead OS: ${lead.pipelineStage}` : null,
		lead.reviewStatus ? `Revisión: ${lead.reviewStatus}` : null,
		`No contactar: ${lead.doNotContact ? "sí" : "no"}`,
		lead.reviewReason ? `Motivo de revisión: ${lead.reviewReason}` : null,
		lead.painHypothesis ? `Dolor: ${lead.painHypothesis}` : null,
		lead.researchSummary ? `Investigación: ${lead.researchSummary}` : null,
		lead.sourceUrl ? `Evidencia: ${lead.sourceUrl}` : null,
		lead.dossier ? `Dossier Lead OS: ${JSON.stringify(lead.dossier)}` : null,
	]
		.filter(Boolean)
		.join("\n");
}

function sourceMarker(sourceId: string) {
	return `Lead OS source: ${sourceId}`;
}

function domainFromUrl(value: string | null | undefined) {
	if (!value) return null;
	try {
		return new URL(value).hostname.replace(/^www\./, "").toLowerCase() || null;
	} catch {
		return null;
	}
}

function clean(value: string | null | undefined) {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}

function normalizeEmail(value: string | null | undefined) {
	const email = clean(value)?.toLowerCase() ?? null;
	if (!email) return null;
	const domain = email.split("@").at(-1) ?? "";
	if (/\.(?:invalid|png|jpe?g|gif|webp|svg|ico)$/i.test(domain)) return null;
	return email;
}
