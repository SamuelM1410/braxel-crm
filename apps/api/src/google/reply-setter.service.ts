import { GMAIL_SEND_SCOPE } from "@crm/auth";
import { ActivityType, type Db, EmailDirection } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { GmailClient } from "./gmail.client";

/**
 * A deliberately narrow, human-gated reply setter. It cannot discover leads,
 * send first messages, or continue a conversation that asks to stop.
 */
@Injectable()
export class ReplySetterService {
	private readonly logger = new Logger(ReplySetterService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly gmail: GmailClient,
	) {}

	async consider(userId: string, emailMessageId: string) {
		const message = await this.db.emailMessage.findUnique({
			where: { id: emailMessageId },
			select: {
				id: true,
				direction: true,
				body: true,
				subject: true,
				fromEmail: true,
				rfcMessageId: true,
				thread: {
					select: {
						id: true,
						companyId: true,
						rootMessageId: true,
						messages: {
							orderBy: { sentAt: "desc" },
							take: 5,
							select: {
								direction: true,
								body: true,
								subject: true,
								fromEmail: true,
								sentAt: true,
							},
						},
					},
				},
			},
		});
		if (
			!message ||
			message.direction !== EmailDirection.INBOUND ||
			!message.thread.companyId
		)
			return;
		const company = await this.db.company.findUnique({
			where: { id: message.thread.companyId },
			select: {
				id: true,
				name: true,
				email: true,
				description: true,
				salesStage: true,
				outreachApprovedAt: true,
				emailAssistantEnabled: true,
				emailAssistantLastReplyAt: true,
				phone: true,
				website: true,
				instagramUrl: true,
				whatsappUrl: true,
			},
		});
		if (!company?.emailAssistantEnabled || !company.outreachApprovedAt) return;
		if (!SENDABLE.has(company.salesStage) || !message.body?.trim()) return;
		if (isStopOrRisk(message.body)) {
			await this.db.company.update({
				where: { id: company.id },
				data: {
					emailAssistantEnabled: false,
					emailAssistantEnabledAt: null,
					salesStage: "PAUSED",
				},
			});
			return this.handoff(
				company.id,
				userId,
				"Stopped: opt-out, complaint, price/contract, or ambiguous reply.",
			);
		}
		if (
			company.emailAssistantLastReplyAt &&
			Date.now() - company.emailAssistantLastReplyAt.getTime() <
				24 * 60 * 60 * 1000
		)
			return;
		const priorOutbound = message.thread.messages.some(
			(item) => item.direction === EmailDirection.OUTBOUND,
		);
		if (!priorOutbound) return;

		const draft = await this.draft(
			company,
			message.body,
			message.subject ?? "",
		);
		if (!draft)
			return this.handoff(
				company.id,
				userId,
				"Eve could not safely prepare a reply; human follow-up required.",
			);
		const scopes = await this.tokens.grantedScopes(userId, "google");
		if (!scopes.has(GMAIL_SEND_SCOPE))
			return this.handoff(
				company.id,
				userId,
				"Reconnect Google with Gmail send permission before enabling automated replies.",
			);
		const token = await this.tokens.accessTokenFor(userId, "gmail");
		if (token.outcome !== "ok") return;
		const profile = await this.gmail.profile(token.accessToken);
		if (profile.outcome !== "ok" || !profile.data.emailAddress) return;
		const result = await this.gmail.send(
			token.accessToken,
			mime({
				to: message.fromEmail,
				from: profile.data.emailAddress,
				subject: replySubject(message.subject),
				body: draft,
				inReplyTo: message.rfcMessageId,
			}),
		);
		if (result.outcome !== "ok")
			return this.handoff(
				company.id,
				userId,
				"Gmail could not deliver Eve's approved reply.",
			);
		await this.db.$transaction([
			this.db.company.update({
				where: { id: company.id },
				data: {
					emailAssistantLastReplyAt: new Date(),
					salesStage: "FOLLOW_UP_ACTIVE",
				},
			}),
			this.db.activity.create({
				data: {
					type: ActivityType.EMAIL,
					subject: replySubject(message.subject),
					body: draft,
					occurredAt: new Date(),
					companyId: company.id,
					createdById: userId,
					meta: {
						channel: "gmail",
						automation: "eve-reply-setter",
						replyTo: message.id,
						approval: "company-level-human",
					},
				},
			}),
		]);
	}

	private async draft(
		company: {
			name: string;
			description: string | null;
			website: string | null;
		},
		incoming: string,
		subject: string,
	) {
		const key = process.env.OPENAI_API_KEY;
		if (!key) return null;
		const prompt = `You are Eve, a careful appointment setter for an AI/web-growth agency. Reply in Spanish, 70-130 words. Context: company ${company.name}; public notes: ${company.description ?? "none"}; site: ${company.website ?? "none"}; subject: ${subject}; inbound reply: ${incoming}. Goal: help the prospect take one small next step toward a 15-minute diagnostic or give a concise helpful answer. Use Hormozi-style clarity: name the relevant outcome, reduce effort/risk, do not exaggerate or guarantee results. Never invent evidence, pricing, case studies, availability, or integrations. Do not pressure. If they ask price, contract, legal, data/privacy, have a complaint, opt out, or need a detailed proposal, return exactly HANDOFF. Output only the email body.`;
		try {
			const res = await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${key}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: process.env.EVE_OPENAI_MODEL || "gpt-4.1-mini",
					temperature: 0.35,
					max_tokens: 260,
					messages: [{ role: "user", content: prompt }],
				}),
			});
			if (!res.ok) return null;
			const json = (await res.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
			};
			const output = json.choices?.[0]?.message?.content?.trim();
			return output && output !== "HANDOFF" && output.length <= 1600
				? output
				: null;
		} catch (error) {
			this.logger.warn(
				`Reply draft failed: ${error instanceof Error ? error.message : "unknown"}`,
			);
			return null;
		}
	}

	private async handoff(companyId: string, userId: string, reason: string) {
		await this.db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "Eve reply setter — human review",
				body: reason,
				occurredAt: new Date(),
				companyId,
				createdById: userId,
				meta: { automation: "eve-reply-setter", action: "handoff" },
			},
		});
	}
}

const SENDABLE = new Set([
	"INTERESTED",
	"FOLLOW_UP_ACTIVE",
	"QUALIFIED",
	"CLOSING_CALL_BOOKED",
	"PROPOSAL_SENT",
	"PAYMENT_PENDING",
]);
function isStopOrRisk(value: string) {
	return /\b(no me interes|no contactar|unsubscribe|cancelar|baja|stop|spam|queja|demanda|legal|contrato|precio|cotizaci[oó]n|presupuesto)\b/i.test(
		value,
	);
}
function replySubject(subject: string | null) {
	const safe = (subject ?? "Seguimiento").replace(/[\r\n]+/g, " ").trim();
	return /^re:/i.test(safe) ? safe : `Re: ${safe}`;
}
function mime(input: {
	to: string;
	from: string;
	subject: string;
	body: string;
	inReplyTo?: string;
}) {
	const h = (v: string) => v.replace(/[\r\n]+/g, " ").trim();
	return Buffer.from(
		[
			`To: ${h(input.to)}`,
			`From: ${h(input.from)}`,
			`Subject: ${h(input.subject)}`,
			...(input.inReplyTo
				? [
						`In-Reply-To: ${h(input.inReplyTo)}`,
						`References: ${h(input.inReplyTo)}`,
					]
				: []),
			"MIME-Version: 1.0",
			'Content-Type: text/plain; charset="UTF-8"',
			"",
			input.body.trim(),
		].join("\r\n"),
		"utf8",
	).toString("base64url");
}
