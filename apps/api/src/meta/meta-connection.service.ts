import { randomUUID } from "node:crypto";
import type { Db } from "@crm/db";
import {
	BadRequestException,
	Injectable,
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
						instagramBusinessAccountId: true,
						instagramUsername: true,
						enabled: true,
					},
				},
			},
		});
		return {
			configured: this.client.configured(),
			connected: Boolean(connection),
			displayName: connection?.displayName ?? null,
			replyAssistantEnabled: connection?.replyAssistantEnabled ?? false,
			pages: connection?.pages ?? [],
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
						page.instagram_business_account?.id ?? null,
					instagramUsername: page.instagram_business_account?.username ?? null,
				},
				update: {
					connectionId: connection.id,
					name: page.name,
					encryptedPageAccessToken: this.tokens.encrypt(page.access_token),
					instagramBusinessAccountId:
						page.instagram_business_account?.id ?? null,
					instagramUsername: page.instagram_business_account?.username ?? null,
				},
			});
			await this.client
				.subscribePage(page.id, page.access_token)
				.catch(() => undefined);
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
		const recipientIds = (connection?.pages ?? []).flatMap((page) =>
			[page.pageId, page.instagramBusinessAccountId].filter(
				(value): value is string => Boolean(value),
			),
		);
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

	async disconnect(userId: string) {
		await this.db.metaConnection.deleteMany({ where: { userId } });
		return { disconnected: true };
	}
}
