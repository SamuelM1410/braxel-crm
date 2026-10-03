import { randomUUID } from "node:crypto";
import { GMAIL_SEND_SCOPE } from "@crm/auth";
import { ActivityType, type Db } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { marketingBody, marketingHeaders } from "./email-marketing";
import { GmailClient } from "./gmail.client";

const MAX_TICK_BUDGET_MS = 45_000;
const MAX_ATTEMPTS = 3;

type CampaignItemInput = {
	companyId?: string;
	contactId?: string;
	recipient: string;
	subject: string;
	body: string;
	consentAt: Date;
	consentSource: string;
	scheduledAt?: Date;
};

type CreateCampaignInput = {
	name: string;
	subjectTemplate: string;
	bodyTemplate: string;
	dailyLimit: number;
	perMinuteLimit: number;
	startsAt?: Date;
	items: CampaignItemInput[];
};

@Injectable()
export class OutreachCampaignService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly gmail: GmailClient,
	) {}

	async list(userId: string) {
		const campaigns = await this.db.outreachCampaign.findMany({
			where: { ownerId: userId },
			orderBy: { createdAt: "desc" },
			include: {
				items: { select: { status: true } },
			},
		});
		return campaigns.map(({ items, ...campaign }) => ({
			...campaign,
			_count: { items: items.length },
			stats: {
				queued: items.filter((item) => item.status === "QUEUED").length,
				sent: items.filter((item) => item.status === "SENT").length,
				failed: items.filter((item) => item.status === "FAILED").length,
				optedOut: items.filter((item) => item.status === "OPTED_OUT").length,
			},
		}));
	}

	async create(userId: string, input: CreateCampaignInput) {
		const now = new Date();
		const duplicateRecipients = new Set<string>();
		const normalizedRecipients = input.items.map((item) =>
			item.recipient.trim().toLowerCase(),
		);
		const optedOut = await this.db.outreachCampaignItem.findMany({
			where: {
				recipient: { in: normalizedRecipients },
				status: "OPTED_OUT",
				campaign: { ownerId: userId },
			},
			select: { recipient: true },
		});
		if (optedOut.length > 0) {
			throw new BadRequestException(
				`Recipient opted out: ${optedOut[0]?.recipient ?? "unknown"}`,
			);
		}
		for (const item of input.items) {
			if (item.consentAt > now) {
				throw new BadRequestException(
					"Consent must be recorded before a campaign item can be queued.",
				);
			}
			const normalized = item.recipient.trim().toLowerCase();
			if (duplicateRecipients.has(normalized)) {
				throw new BadRequestException(
					`Duplicate recipient in campaign: ${normalized}`,
				);
			}
			duplicateRecipients.add(normalized);
			if (!item.consentSource.trim()) {
				throw new BadRequestException("Each recipient needs a consent source.");
			}
		}

		const campaignId = randomUUID();
		return this.db.outreachCampaign.create({
			data: {
				id: campaignId,
				ownerId: userId,
				name: input.name,
				subjectTemplate: input.subjectTemplate,
				bodyTemplate: input.bodyTemplate,
				dailyLimit: input.dailyLimit,
				perMinuteLimit: input.perMinuteLimit,
				startsAt: input.startsAt ?? now,
				items: {
					create: input.items.map((item, index) => ({
						id: randomUUID(),
						companyId: item.companyId,
						contactId: item.contactId,
						recipient: item.recipient.trim().toLowerCase(),
						subject: item.subject,
						body: item.body,
						consentAt: item.consentAt,
						consentSource: item.consentSource,
						scheduledAt: item.scheduledAt ?? input.startsAt ?? now,
						idempotencyKey: `${campaignId}:${index}:${item.recipient.trim().toLowerCase()}`,
					})),
				},
			},
			include: { items: true },
		});
	}

	async optOut(userId: string, recipient: string) {
		const normalized = recipient.trim().toLowerCase();
		const result = await this.db.outreachCampaignItem.updateMany({
			where: {
				recipient: normalized,
				campaign: { ownerId: userId },
				status: { in: ["QUEUED", "SENDING"] },
			},
			data: {
				status: "OPTED_OUT",
				optedOutAt: new Date(),
				sendingAt: null,
			},
		});
		return { recipient: normalized, optedOut: result.count };
	}

	async activate(userId: string, campaignId: string) {
		const campaign = await this.findOwned(userId, campaignId);
		if (campaign.status === "COMPLETED" || campaign.status === "CANCELLED") {
			throw new BadRequestException("This campaign cannot be activated again.");
		}
		return this.db.outreachCampaign.update({
			where: { id: campaign.id },
			data: { status: "ACTIVE", stoppedAt: null },
		});
	}

	async pause(userId: string, campaignId: string) {
		const campaign = await this.findOwned(userId, campaignId);
		return this.db.outreachCampaign.update({
			where: { id: campaign.id },
			data: { status: "PAUSED", stoppedAt: new Date() },
		});
	}

	async runCampaign(userId: string, campaignId: string) {
		await this.findOwned(userId, campaignId);
		return this.runOne(campaignId);
	}

	/** Called by the existing authenticated cron route. */
	async runDue() {
		const startedAt = Date.now();
		const campaigns = await this.db.outreachCampaign.findMany({
			where: {
				status: "ACTIVE",
				OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
			},
			select: { id: true },
		});

		let sent = 0;
		let failed = 0;
		for (const campaign of campaigns) {
			if (Date.now() - startedAt >= MAX_TICK_BUDGET_MS) break;
			const result = await this.runOne(campaign.id);
			sent += result.sent;
			failed += result.failed;
		}

		return { campaigns: campaigns.length, sent, failed };
	}

	private async runOne(campaignId: string) {
		const campaign = await this.db.outreachCampaign.findUnique({
			where: { id: campaignId },
			include: { owner: { select: { id: true } } },
		});
		if (campaign?.status !== "ACTIVE") {
			return { sent: 0, failed: 0 };
		}

		const now = new Date();
		const dayStart = new Date(now);
		dayStart.setHours(0, 0, 0, 0);
		const minuteStart = new Date(now.getTime() - 60_000);
		const [sentToday, sentThisMinute] = await Promise.all([
			this.db.outreachCampaignItem.count({
				where: { campaignId, status: "SENT", sentAt: { gte: dayStart } },
			}),
			this.db.outreachCampaignItem.count({
				where: {
					campaignId,
					status: "SENT",
					sentAt: { gte: minuteStart },
				},
			}),
		]);

		const budget = Math.min(
			Math.max(campaign.dailyLimit - sentToday, 0),
			Math.max(campaign.perMinuteLimit - sentThisMinute, 0),
		);
		if (budget === 0) return { sent: 0, failed: 0 };

		const granted = await this.tokens.grantedScopes(
			campaign.owner.id,
			"google",
		);
		if (!granted.has(GMAIL_SEND_SCOPE)) {
			await this.pauseForReconnect(campaignId);
			return { sent: 0, failed: 0 };
		}
		const token = await this.tokens.accessTokenFor(campaign.owner.id, "gmail");
		if (token.outcome !== "ok") {
			await this.pauseForReconnect(campaignId);
			return { sent: 0, failed: 0 };
		}
		const profile = await this.gmail.profile(token.accessToken);
		if (profile.outcome !== "ok" || !profile.data.emailAddress) {
			await this.pauseForReconnect(campaignId);
			return { sent: 0, failed: 0 };
		}

		let sent = 0;
		let failed = 0;
		for (let index = 0; index < budget; index += 1) {
			const item = await this.claimNext(campaignId);
			if (!item) break;

			const result = await this.gmail.send(
				token.accessToken,
				encodeMessage({
					to: item.recipient,
					from: profile.data.emailAddress,
					subject: item.subject,
					body: item.body,
				}),
			);

			if (result.outcome === "ok") {
				sent += 1;
				await this.markSent(campaign, item.id, result.data.id ?? null);
			} else if (result.outcome === "rate-limited") {
				await this.reschedule(item.id, result.reason, result.retryAfterMs);
				break;
			} else if (
				result.outcome === "failed" &&
				result.retryable &&
				item.attempts < MAX_ATTEMPTS
			) {
				await this.reschedule(item.id, result.reason, backoff(item.attempts));
				failed += 1;
			} else {
				await this.markFailed(item.id, result.reason);
				failed += 1;
			}
		}

		await this.db.outreachCampaign.update({
			where: { id: campaignId },
			data: { lastRunAt: new Date() },
		});
		await this.completeIfDrained(campaignId);
		return { sent, failed };
	}

	private async claimNext(campaignId: string) {
		const candidate = await this.db.outreachCampaignItem.findFirst({
			where: {
				campaignId,
				status: "QUEUED",
				scheduledAt: { lte: new Date() },
			},
			orderBy: { scheduledAt: "asc" },
		});
		if (!candidate) return null;
		const claimed = await this.db.outreachCampaignItem.updateMany({
			where: { id: candidate.id, status: "QUEUED" },
			data: {
				status: "SENDING",
				sendingAt: new Date(),
				attempts: { increment: 1 },
			},
		});
		return claimed.count === 1
			? { ...candidate, attempts: candidate.attempts + 1 }
			: null;
	}

	private async markSent(
		campaign: { ownerId: string },
		itemId: string,
		providerMessageId: string | null,
	) {
		const item = await this.db.outreachCampaignItem.update({
			where: { id: itemId },
			data: {
				status: "SENT",
				sentAt: new Date(),
				providerMessageId,
				lastError: null,
			},
			select: {
				recipient: true,
				subject: true,
				body: true,
				companyId: true,
				contactId: true,
			},
		});
		await this.db.activity.create({
			data: {
				type: ActivityType.EMAIL,
				subject: item.subject,
				body: item.body,
				occurredAt: new Date(),
				companyId: item.companyId,
				contactId: item.contactId,
				createdById: campaign.ownerId,
				meta: {
					channel: "gmail",
					recipient: item.recipient,
					providerMessageId,
					automation: "consent-gated-campaign",
				},
			},
		});
	}

	private async markFailed(itemId: string, reason: string) {
		await this.db.outreachCampaignItem.update({
			where: { id: itemId },
			data: {
				status: "FAILED",
				failedAt: new Date(),
				lastError: reason.slice(0, 1_000),
			},
		});
	}

	private async reschedule(itemId: string, reason: string, delayMs: number) {
		await this.db.outreachCampaignItem.update({
			where: { id: itemId },
			data: {
				status: "QUEUED",
				sendingAt: null,
				scheduledAt: new Date(Date.now() + delayMs),
				lastError: reason.slice(0, 1_000),
			},
		});
	}

	private async pauseForReconnect(campaignId: string) {
		await this.db.outreachCampaign.update({
			where: { id: campaignId },
			data: { status: "PAUSED", stoppedAt: new Date() },
		});
	}

	private async completeIfDrained(campaignId: string) {
		const pending = await this.db.outreachCampaignItem.count({
			where: { campaignId, status: { in: ["QUEUED", "SENDING"] } },
		});
		if (pending === 0) {
			await this.db.outreachCampaign.update({
				where: { id: campaignId },
				data: { status: "COMPLETED" },
			});
		}
	}

	private async findOwned(userId: string, campaignId: string) {
		const campaign = await this.db.outreachCampaign.findFirst({
			where: { id: campaignId, ownerId: userId },
		});
		if (!campaign) throw new NotFoundException("Campaign not found.");
		return campaign;
	}
}

function backoff(attempts: number) {
	return Math.min(15 * 60_000, 30_000 * 2 ** Math.max(attempts - 1, 0));
}

function encodeMessage(input: {
	to: string;
	from: string;
	subject: string;
	body: string;
}) {
	const header = (value: string) => value.replace(/[\\r\\n]+/g, " ").trim();
	const mime = [
		`To: ${header(input.to)}`,
		`From: ${header(input.from)}`,
		`Subject: ${header(input.subject)}`,
		...marketingHeaders(input.to),
		"MIME-Version: 1.0",
		'Content-Type: text/plain; charset="UTF-8"',
		"Content-Transfer-Encoding: 8bit",
		"",
		marketingBody(input.body, input.to),
	].join("\\r\\n");
	return Buffer.from(mime, "utf8").toString("base64url");
}
