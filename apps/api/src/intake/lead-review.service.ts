import { ActivityType, type Db } from "@crm/db";
import { LEAD_OS_LABELS, LEAD_REVIEW } from "@crm/validation";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
	type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import {
	HACKATHON_DEMO,
	hackathonDemoEnabled,
	hackathonDemoRequested,
} from "../hackathon-demo/hackathon-demo.config";

export type LeadReviewDecision = "APPROVED" | "REJECTED";

const REVIEW_LINE = new RegExp(
	`^(${[
		LEAD_OS_LABELS.review,
		LEAD_OS_LABELS.doNotContact,
		LEAD_OS_LABELS.reviewedBy,
		LEAD_OS_LABELS.reviewReason,
	].join("|")}):`,
);

@Injectable()
export class LeadReviewService implements OnModuleInit {
	private readonly logger = new Logger(LeadReviewService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: ConfigService,
		private readonly stamp: ActivityStampService,
	) {}

	onModuleInit() {
		if (hackathonDemoRequested() && !hackathonDemoEnabled()) {
			this.logger.error({
				message: `${HACKATHON_DEMO.flag} is ignored in production. Review decisions still go to Lead OS.`,
			});
		}
	}

	async decide(
		companyId: string,
		decision: LeadReviewDecision,
		reviewer: string,
		reviewerId: string,
		reason: string,
	) {
		const cleanReason = reason.trim();
		if (cleanReason.length < LEAD_REVIEW.reason.minLength) {
			throw new BadRequestException(
				`A review decision needs a reason of at least ${LEAD_REVIEW.reason.minLength} characters.`,
			);
		}

		const company = await this.db.company.findUnique({
			where: { id: companyId },
			select: { id: true, description: true },
		});
		if (!company)
			throw new NotFoundException(`No company with id ${companyId}.`);

		const sourceId = sourceIdFromDescription(company.description);
		if (!sourceId) {
			throw new BadRequestException(
				"This company is not a Lead OS review lead.",
			);
		}

		if (hackathonDemoEnabled()) {
			this.logger.log({
				message: "Demo mode: review decision not sent to Lead OS",
				companyId,
				decision,
			});
		} else {
			const webhookUrl = this.webhookUrl();
			if (webhookUrl) {
				await this.forward(
					webhookUrl,
					companyId,
					sourceId,
					decision,
					reviewer,
					cleanReason,
				);
			} else {
				this.logger.warn({
					message:
						"Lead review webhook is not configured; saving the decision locally",
					companyId,
					decision,
				});
			}
		}

		const occurredAt = new Date();
		const activity = await this.db.$transaction(async (tx) => {
			await tx.company.update({
				where: { id: companyId },
				data: {
					description: withReviewDecision(
						company.description,
						decision,
						reviewer,
						cleanReason,
					),
				},
			});
			return tx.activity.create({
				data: {
					type: ActivityType.NOTE,
					subject: `Lead review: ${decision === "APPROVED" ? "approved" : "rejected"} by ${reviewer}`,
					body: cleanReason,
					companyId,
					createdById: reviewerId,
					occurredAt,
					meta: { leadReviewDecision: decision, reviewer },
				},
				select: { createdAt: true },
			});
		});
		await this.stamp.touch({ companyId }, activity.createdAt);
		return { decision };
	}

	private async forward(
		webhookUrl: string,
		companyId: string,
		sourceId: string,
		decision: LeadReviewDecision,
		reviewer: string,
		reason: string,
	) {
		try {
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sourceId,
					decision,
					reviewedBy: reviewer,
					reason,
				}),
			});
			if (!response.ok) {
				this.logger.warn({
					message: "Lead OS review sync returned a non-success status",
					companyId,
					decision,
					status: response.status,
				});
			}
		} catch (error) {
			this.logger.warn({
				message: "Lead OS review sync was unreachable; decision kept in CRM",
				companyId,
				decision,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private webhookUrl(): string | null {
		const configured = this.config
			.get<string>("LEAD_OS_REVIEW_WEBHOOK_URL")
			?.trim();
		if (configured) return configured;

		// The old Docker hostname is useful only for local development. Never
		// attempt it from Railway/Vercel: it turns a valid CRM save into fetch failed.
		return process.env.NODE_ENV === "production"
			? null
			: "http://host.docker.internal:5678/webhook/agency-lead-os-review-decision";
	}
}

function sourceIdFromDescription(description: string | null) {
	return (
		description
			?.match(new RegExp(`^${LEAD_OS_LABELS.source}:\\s*(.+)$`, "m"))?.[1]
			?.trim() ?? null
	);
}

function withReviewDecision(
	description: string | null,
	decision: LeadReviewDecision,
	reviewer: string,
	reason: string,
) {
	const next = (description ?? "")
		.split("\n")
		.filter((line) => !REVIEW_LINE.test(line));
	next.push(`${LEAD_OS_LABELS.review}: ${decision}`);
	next.push(
		`${LEAD_OS_LABELS.doNotContact}: ${decision === "REJECTED" ? "sí" : "no"}`,
	);
	next.push(`${LEAD_OS_LABELS.reviewedBy}: ${oneLine(reviewer)}`);
	next.push(`${LEAD_OS_LABELS.reviewReason}: ${oneLine(reason)}`);
	return next.join("\n");
}

function oneLine(value: string) {
	return value.replace(/\s*[\r\n]+\s*/g, " ").trim();
}
