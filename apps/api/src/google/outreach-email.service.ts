import { GMAIL_SEND_SCOPE } from "@crm/auth";
import { ActivityType, type Db } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { GmailClient } from "./gmail.client";

const SENDABLE_STAGES = new Set([
	"INTERESTED",
	"FOLLOW_UP_ACTIVE",
	"QUALIFIED",
	"CLOSING_CALL_BOOKED",
	"PROPOSAL_SENT",
	"PAYMENT_PENDING",
]);

@Injectable()
export class OutreachEmailService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly gmail: GmailClient,
	) {}

	async sendApproved(
		userId: string,
		input: { companyId: string; subject: string; body: string },
	) {
		const company = await this.db.company.findUnique({
			where: { id: input.companyId },
			select: {
				id: true,
				name: true,
				email: true,
				primaryContact: { select: { email: true } },
				contacts: {
					where: { email: { not: null } },
					take: 1,
					select: { email: true },
				},
				salesStage: true,
				outreachApprovedAt: true,
			},
		});
		if (!company) throw new NotFoundException("Company not found.");
		if (!company.outreachApprovedAt) {
			throw new BadRequestException(
				"A human must approve outreach before any email can be sent.",
			);
		}
		if (!SENDABLE_STAGES.has(company.salesStage)) {
			throw new BadRequestException(
				"Email follow-up is available only after a positive or qualified sales outcome.",
			);
		}

		const recipient =
			company.email ??
			company.primaryContact?.email ??
			company.contacts[0]?.email;
		if (!recipient)
			throw new BadRequestException("This company has no email recipient.");

		const granted = await this.tokens.grantedScopes(userId, "google");
		if (!granted.has(GMAIL_SEND_SCOPE)) {
			throw new BadRequestException(
				"Reconnect Google and grant Gmail send permission before sending outreach.",
			);
		}

		const token = await this.tokens.accessTokenFor(userId, "gmail");
		if (token.outcome !== "ok") {
			throw new ServiceUnavailableException(token.reason);
		}
		const profile = await this.gmail.profile(token.accessToken);
		if (profile.outcome !== "ok" || !profile.data.emailAddress) {
			throw new ServiceUnavailableException(
				"Gmail could not identify the sending mailbox.",
			);
		}

		const sent = await this.gmail.send(
			token.accessToken,
			encodeMessage({
				to: recipient,
				from: profile.data.emailAddress,
				subject: input.subject,
				body: input.body,
			}),
		);
		if (sent.outcome !== "ok") {
			throw new ServiceUnavailableException(sent.reason);
		}

		await this.db.$transaction([
			this.db.activity.create({
				data: {
					type: ActivityType.EMAIL,
					subject: input.subject,
					body: input.body,
					occurredAt: new Date(),
					companyId: company.id,
					createdById: userId,
					meta: {
						channel: "gmail",
						recipient,
						gmailMessageId: sent.data.id ?? null,
						approval: "human",
					},
				},
			}),
			this.db.company.update({
				where: { id: company.id },
				data: { salesStage: "FOLLOW_UP_ACTIVE", lastActivityAt: new Date() },
			}),
		]);

		return {
			ok: true as const,
			recipient,
			gmailMessageId: sent.data.id ?? null,
		};
	}
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
		"MIME-Version: 1.0",
		'Content-Type: text/plain; charset="UTF-8"',
		"Content-Transfer-Encoding: 8bit",
		"",
		input.body.trim(),
	].join("\\r\\n");
	return Buffer.from(mime, "utf8").toString("base64url");
}
