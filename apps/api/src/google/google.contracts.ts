import { z } from "zod";
import { GOOGLE_SYNC_SOURCES } from "./google.constants";

export const setAutoCreateInput = z.object({
	source: z.enum(GOOGLE_SYNC_SOURCES),
	enabled: z.boolean(),
});

export const suppressDomainInput = z.object({
	domain: z.string().trim().min(1),
	reason: z.string().trim().max(200).optional(),
	purge: z.boolean().default(true),
});

export const threadInput = z.object({
	threadId: z.string(),
});

export const calendarEventInput = z.object({
	eventId: z.string(),
});

export const sendApprovedEmailInput = z.object({
	companyId: z.string(),
	subject: z.string().trim().min(1).max(180),
	body: z.string().trim().min(1).max(12_000),
});

export const setEmailAssistantInput = z.object({
	companyId: z.string(),
	enabled: z.boolean(),
});

const campaignItemInput = z.object({
	companyId: z.string().optional(),
	contactId: z.string().optional(),
	recipient: z.string().trim().email().max(320),
	subject: z.string().trim().min(1).max(180),
	body: z.string().trim().min(1).max(12_000),
	consentAt: z.coerce.date(),
	consentSource: z.string().trim().min(1).max(200),
	scheduledAt: z.coerce.date().optional(),
});

export const createOutreachCampaignInput = z.object({
	name: z.string().trim().min(1).max(120),
	subjectTemplate: z.string().trim().min(1).max(180),
	bodyTemplate: z.string().trim().min(1).max(12_000),
	dailyLimit: z.number().int().min(1).max(500).default(25),
	perMinuteLimit: z.number().int().min(1).max(30).default(2),
	startsAt: z.coerce.date().optional(),
	items: z.array(campaignItemInput).min(1).max(1_000),
});

export const campaignIdInput = z.object({
	campaignId: z.string().min(1),
});

export const optOutRecipientInput = z.object({
	recipient: z.string().trim().email().max(320),
});

export type SetAutoCreateInput = z.infer<typeof setAutoCreateInput>;
export type SuppressDomainInput = z.infer<typeof suppressDomainInput>;
