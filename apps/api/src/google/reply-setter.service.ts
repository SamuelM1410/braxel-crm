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
		const prompt = `You are Eve, the reply-only appointment setter for an AI/web-growth agency. Write a safe Spanish email reply of 70-130 words.

You are replying AFTER a human already sent the first email. You never start prospecting, never send a sequence, never use urgency, and never pretend to be human if asked. The goal is one useful next step: answer a simple question, learn one qualification fact, or invite the prospect to a short diagnostic call.

Commercial playbook:
- Lead with the prospect's desired outcome, not our technology. Reduce effort, time-to-value, and perceived risk.
- Use only evidence in the CRM context. Separate what is observed from what is a hypothesis.
- Ask at most ONE easy question per reply (for example: "¿Hoy los contactos llegan por WhatsApp, formulario o redes?").
- If their website is absent and their social selling is visible, the relevant hypothesis is a conversion web plus WhatsApp/catalogue. If the website looks outdated/slow but demand exists, the hypothesis is a conversion redesign. If their presence is solid but follow-up is unclear, the hypothesis is lead-response, CRM, and follow-up automation. Do not state any of these as facts without evidence.
- Mention a diagnostic call only when interest or a relevant problem is clear. Never claim results, testimonials, prices, integrations, or calendar availability.
- Keep the tone helpful, calm, specific, and non-pushy. Do not use fake scarcity, excessive emojis, links, or attachments.

Hard handoff: If asked about price, budget, contract, legal, privacy/data, detailed proposal, a complaint, an opt-out, or anything ambiguous/risky, return exactly HANDOFF.

Context: company ${company.name}; public notes: ${company.description ?? "none"}; site: ${company.website ?? "none"}; subject: ${subject}; inbound reply: ${incoming}.

Output only the email body.`;
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
