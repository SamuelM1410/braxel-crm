import { z } from "zod";
import { bulkIdsInput } from "../crm/bulk";
import { recordFieldValues } from "../fields/fields.contracts";
import { listInput } from "../trpc/list-input";

export const companyListInput = listInput.extend({
	owner: z.string().default("all"),
	industry: z.string().default("all"),
	enrichment: z.string().default("all"),
	source: z.string().default("all"),
});

export type CompanyListInput = z.infer<typeof companyListInput>;

export const companyCreateInput = z.object({
	name: z.string().trim().min(1, "A company needs a name."),
	domain: z.string().trim().optional(),
	ownerId: z.string().nullable().optional(),
});

export type CompanyCreateInput = z.infer<typeof companyCreateInput>;

const companyUpdateInput = z.object({
	name: z.string().trim().min(1).optional(),
	domain: z.string().optional(),
	website: z.string().optional(),
	description: z.string().optional(),
	industry: z.string().optional(),
	city: z.string().optional(),
	stateCode: z.string().optional(),
	country: z.string().optional(),
	phone: z.string().optional(),
	email: z.string().optional(),
	linkedinUrl: z.string().optional(),
	instagramUrl: z.string().optional(),
	facebookUrl: z.string().optional(),
	tiktokUrl: z.string().optional(),
	whatsappUrl: z.string().optional(),
	salesStage: z
		.enum([
			"DISCOVERED",
			"CALL_PENDING",
			"INTERESTED",
			"FOLLOW_UP_ACTIVE",
			"QUALIFIED",
			"CLOSING_CALL_BOOKED",
			"PROPOSAL_SENT",
			"PAYMENT_PENDING",
			"WON",
			"LOST",
			"PAUSED",
		])
		.optional(),
	preferredContactChannel: z
		.enum([
			"PHONE",
			"WHATSAPP",
			"INSTAGRAM",
			"FACEBOOK",
			"LINKEDIN",
			"EMAIL",
			"WEBSITE",
		])
		.nullable()
		.optional(),
	firstCallOutcome: z.string().max(2000).optional(),
	salesNotes: z.string().max(5000).optional(),
	nextSalesActionAt: z.string().datetime().nullable().optional(),
	outreachApproved: z.boolean().optional(),
	ownerId: z.string().nullable().optional(),
	fields: recordFieldValues.optional(),
});

export type CompanyUpdateInput = z.infer<typeof companyUpdateInput>;

export const companyUpdateArgs = z.object({
	id: z.string(),
	data: companyUpdateInput,
});

export const companyIdInput = z.object({ id: z.string() });

export const companyLeadReviewInput = z.object({
	id: z.string(),
	decision: z.enum(["APPROVED", "REJECTED"]),
	reason: z.string().trim().min(3).max(1000).optional(),
});

export const setPrimaryContactInput = z.object({
	companyId: z.string(),
	contactId: z.string().nullable(),
});

export const companyOptionsInput = z.object({
	q: z.string().default(""),
});

export const companyBulkInput = bulkIdsInput;

export const companyBulkOwnerInput = bulkIdsInput.extend({
	ownerId: z.string().nullable(),
});

export type CompanyBulkOwnerInput = z.infer<typeof companyBulkOwnerInput>;
