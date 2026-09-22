import { randomUUID } from "node:crypto";
import type { Db } from "@crm/db";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { MetaClient } from "./meta.client";
import { MetaTokenService } from "./meta-token.service";

@Injectable()
export class MetaConnectionService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly client: MetaClient,
		private readonly tokens: MetaTokenService,
	) {}

	async status(userId: string) {
		const connection = await this.db.metaConnection.findUnique({
			where: { userId },
			include: {
				pages: {
					orderBy: { name: "asc" },
					select: {
						id: true,
						pageId: true,
						name: true,
						encryptedPageAccessToken: true,
						instagramBusinessAccountId: true,
						instagramUsername: true,
						enabled: true,
					},
				},
			},
		});
		const pages = await Promise.all(
			(connection?.pages ?? []).map(async (page) => {
				const instagramFallback = this.client.instagramFallback();
				const instagramBusinessAccountId =
					page.instagramBusinessAccountId ?? instagramFallback?.id ?? null;
				const instagramUsername =
					page.instagramUsername ?? instagramFallback?.username ?? null;
				if (
					instagramFallback &&
					(!page.instagramBusinessAccountId || !page.instagramUsername)
				) {
					await this.db.metaPage.update({
						where: { id: page.id },
						data: { instagramBusinessAccountId, instagramUsername },
					});
				}
				const { encryptedPageAccessToken, ...publicPage } = page;
				try {
					const subscription = await this.client.pageSubscription(
						page.pageId,
						this.tokens.decrypt(encryptedPageAccessToken),
					);
					return {
						...publicPage,
						instagramBusinessAccountId,
						instagramUsername,
						webhookState: subscription.active
							? ("active" as const)
							: ("missing" as const),
						webhookFields: subscription.fields,
					};
				} catch {
					return {
						...publicPage,
						instagramBusinessAccountId,
						instagramUsername,
						webhookState: "error" as const,
						webhookFields: [],
					};
				}
			}),
		);
		return {
			configured: this.client.configured(),
			connected: Boolean(connection),
			displayName: connection?.displayName ?? null,
			replyAssistantEnabled: connection?.replyAssistantEnabled ?? false,
			pages,
			callbackUrl: this.client.callbackUrl(),
			webhookUrl: new URL("/api/meta/webhook", this.client.apiUrl()).toString(),
		};
	}

	async begin(userId: string, returnUrl: string) {
		if (!this.client.configured())
			throw new ServiceUnavailableException("Meta is not configured.");
		if (!returnUrl.startsWith("/"))
			throw new BadRequestException("Invalid return URL.");
		const id = randomUUID();
		await this.db.metaOAuthState.create({
			data: {
				id,
				userId,
				returnUrl,
				expiresAt: new Date(Date.now() + 10 * 60_000),
			},
		});
		return this.client.authorizeUrl(id);
	}

	async complete(stateId: string, code: string) {
		const state = await this.db.metaOAuthState
			.delete({ where: { id: stateId } })
			.catch(() => null);
		if (!state || state.expiresAt < new Date())
			throw new BadRequestException("Meta connection expired. Start again.");
		const token = await this.client.exchange(code);
		const [me, pages, assignedPages] = await Promise.all([
			this.client.me(token.access_token),
			this.client.pages(token.access_token),
			this.client.assignedPages(token.access_token).catch(() => []),
		]);
		const discoveredPages = [
			...new Map(
				[...pages, ...assignedPages].map((page) => [page.id, page]),
			).values(),
		];
		const instagramFallback = this.client.instagramFallback();
		const connection = await this.db.metaConnection.upsert({
			where: { userId: state.userId },
			create: {
				userId: state.userId,
				metaUserId: me.id,
				displayName: me.name ?? null,
				encryptedAccessToken: this.tokens.encrypt(token.access_token),
				tokenExpiresAt: token.expires_in
					? new Date(Date.now() + token.expires_in * 1000)
					: null,
			},
			update: {
				metaUserId: me.id,
				displayName: me.name ?? null,
				encryptedAccessToken: this.tokens.encrypt(token.access_token),
				tokenExpiresAt: token.expires_in
					? new Date(Date.now() + token.expires_in * 1000)
					: null,
				connectedAt: new Date(),
			},
		});
		for (const page of discoveredPages) {
			await this.db.metaPage.upsert({
				where: { pageId: page.id },
				create: {
					connectionId: connection.id,
					pageId: page.id,
					name: page.name,
					encryptedPageAccessToken: this.tokens.encrypt(page.access_token),
					instagramBusinessAccountId:
						page.instagram_business_account?.id ??
						instagramFallback?.id ??
						null,
					instagramUsername:
						page.instagram_business_account?.username ??
						instagramFallback?.username ??
						null,
				},
				update: {
					connectionId: connection.id,
					name: page.name,
					encryptedPageAccessToken: this.tokens.encrypt(page.access_token),
					instagramBusinessAccountId:
						page.instagram_business_account?.id ??
						instagramFallback?.id ??
						null,
					instagramUsername:
						page.instagram_business_account?.username ??
						instagramFallback?.username ??
						null,
				},
			});
			await this.client.subscribePage(page.id, page.access_token);
		}
		return state.returnUrl;
	}

	async setAssistant(
		userId: string,
		enabled: boolean,
	): Promise<{ replyAssistantEnabled: boolean }> {
		return this.db.metaConnection.update({
			where: { userId },
			data: { replyAssistantEnabled: enabled },
			select: { replyAssistantEnabled: true },
		});
	}

	async threads(userId: string, limit: number) {
		const connection = await this.db.metaConnection.findUnique({
			where: { userId },
			select: {
				pages: {
					select: { pageId: true, instagramBusinessAccountId: true },
				},
			},
		});
		const instagramFallback = this.client.instagramFallback();
		const recipientIds = (connection?.pages ?? []).flatMap((page) =>
			[page.pageId, page.instagramBusinessAccountId].filter(
				(value): value is string => Boolean(value),
			),
		);
		if (instagramFallback?.id) recipientIds.push(instagramFallback.id);
		if (recipientIds.length === 0) return [];
		const threads = await this.db.socialThread.findMany({
			where: { externalRecipientId: { in: recipientIds } },
			orderBy: { lastMessageAt: "desc" },
			take: limit,
			include: {
				company: { select: { id: true, name: true } },
				contact: {
					select: { id: true, firstName: true, lastName: true, email: true },
				},
				messages: {
					orderBy: { sentAt: "desc" },
					take: 20,
				},
			},
		});
		return threads.map((thread) => ({
			id: thread.id,
			channel: thread.channel,
			externalSenderId: thread.externalSenderId,
			externalRecipientId: thread.externalRecipientId,
			lastMessageAt: thread.lastMessageAt.toISOString(),
			messageCount: thread.messageCount,
			company: thread.company,
			contact: thread.contact,
			messages: thread.messages.map((message) => ({
				id: message.id,
				externalMessageId: message.externalMessageId,
				direction: message.direction,
				body: message.body,
				sentAt: message.sentAt.toISOString(),
			})),
		}));
	}

	async refreshSubscriptions(userId: string, pageId?: string) {
		const pages = await this.db.metaPage.findMany({
			where: {
				connection: { userId },
				...(pageId ? { pageId } : {}),
			},
			select: {
				pageId: true,
				encryptedPageAccessToken: true,
			},
		});
		if (pages.length === 0)
			throw new NotFoundException("No connected Meta Page.");
		for (const page of pages)
			await this.client.subscribePage(
				page.pageId,
				this.tokens.decrypt(page.encryptedPageAccessToken),
			);
		return { refreshed: pages.length };
	}

	async sendReply(userId: string, threadId: string, body: string) {
		const thread = await this.db.socialThread.findUnique({
			where: { id: threadId },
			include: {
				messages: { orderBy: { sentAt: "desc" }, take: 1 },
			},
		});
		if (!thread) throw new NotFoundException("Conversation not found.");
		if (thread.channel !== "FACEBOOK" && thread.channel !== "INSTAGRAM")
			throw new BadRequestException("This conversation is not a Meta DM.");
		const page = await this.db.metaPage.findFirst({
			where: {
				enabled: true,
				connection: { userId },
				OR: [
					{ pageId: thread.externalRecipientId ?? "" },
					{
						instagramBusinessAccountId: thread.externalRecipientId ?? "",
					},
				],
			},
		});
		const fallbackPage =
			page ??
			(this.client.instagramFallback()?.id === thread.externalRecipientId &&
			thread.channel === "INSTAGRAM"
				? await this.db.metaPage.findFirst({
						where: { enabled: true, connection: { userId } },
					})
				: null);
		if (!fallbackPage)
			throw new ForbiddenException(
				"Conversation is not connected to this account.",
			);
		const latest = thread.messages[0];
		if (latest?.direction !== "INBOUND")
			throw new BadRequestException(
				"Wait for a new inbound message before replying.",
			);
		if (Date.now() - latest.sentAt.getTime() > 24 * 60 * 60_000)
			throw new BadRequestException(
				"The 24-hour Meta reply window has expired.",
			);
		if (
			/\b(stop|unsubscribe|remove me|no me escrib|no contactar|salir)\b/i.test(
				body,
			)
		)
			throw new BadRequestException(
				"This draft appears to contain an opt-out instruction.",
			);
		const sent = await this.client.send(
			fallbackPage.pageId,
			this.tokens.decrypt(fallbackPage.encryptedPageAccessToken),
			thread.externalSenderId,
			body,
		);
		const sentAt = new Date();
		await this.db.$transaction([
			this.db.socialMessage.create({
				data: {
					threadId: thread.id,
					externalMessageId: sent.message_id,
					direction: "OUTBOUND",
					senderId: thread.externalRecipientId ?? fallbackPage.pageId,
					body,
					raw: sent,
					sentAt,
				},
			}),
			this.db.socialThread.update({
				where: { id: thread.id },
				data: { lastMessageAt: sentAt, messageCount: { increment: 1 } },
			}),
		]);
		return { sent: true, messageId: sent.message_id };
	}

	async disconnect(userId: string) {
		await this.db.metaConnection.deleteMany({ where: { userId } });
		return { disconnected: true };
	}
}
