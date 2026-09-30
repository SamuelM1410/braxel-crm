import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { ConversationService } from "./conversation.service";
import {
	calendarEventInput,
	campaignIdInput,
	createOutreachCampaignInput,
	optOutRecipientInput,
	sendApprovedEmailInput,
	setAutoCreateInput,
	setEmailAssistantInput,
	suppressDomainInput,
	threadInput,
} from "./google.contracts";
import { GoogleConnectionService } from "./google-connection.service";
import { GoogleSyncService } from "./google-sync.service";
import { OutreachCampaignService } from "./outreach-campaign.service";
import { OutreachEmailService } from "./outreach-email.service";

@Router({ alias: "google" })
@UseMiddlewares(AuthMiddleware)
export class GoogleRouter {
	constructor(
		@Inject(GoogleConnectionService)
		private readonly connection: GoogleConnectionService,
		@Inject(GoogleSyncService) private readonly sync: GoogleSyncService,
		@Inject(ConversationService)
		private readonly conversations: ConversationService,
		@Inject(OutreachEmailService)
		private readonly outreach: OutreachEmailService,
		private readonly campaignService: OutreachCampaignService,
	) {}

	@Query()
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation()
	async purgeSyncedData(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.purgeSyncedData(ctx.user.id);
	}

	@Mutation()
	async revokeAccess(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.revoke(ctx.user.id);
	}

	@Mutation()
	async syncNow(@Ctx() ctx: AuthedTrpcContext) {
		await this.sync.runForUser(ctx.user.id);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({ input: sendApprovedEmailInput })
	async sendApprovedEmail(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof sendApprovedEmailInput>,
	) {
		return this.outreach.sendApproved(ctx.user.id, input);
	}

	@Mutation({ input: setEmailAssistantInput })
	async setEmailAssistant(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setEmailAssistantInput>,
	) {
		return this.outreach.setReplyAssistant(ctx.user.id, input);
	}

	@Query()
	async campaigns(@Ctx() ctx: AuthedTrpcContext) {
		return this.campaignService.list(ctx.user.id);
	}

	@Mutation({ input: createOutreachCampaignInput })
	async createCampaign(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createOutreachCampaignInput>,
	) {
		return this.campaignService.create(ctx.user.id, input);
	}

	@Mutation({ input: campaignIdInput })
	async activateCampaign(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("campaignId") campaignId: string,
	) {
		return this.campaignService.activate(ctx.user.id, campaignId);
	}

	@Mutation({ input: campaignIdInput })
	async pauseCampaign(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("campaignId") campaignId: string,
	) {
		return this.campaignService.pause(ctx.user.id, campaignId);
	}

	@Mutation({ input: campaignIdInput })
	async runCampaign(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("campaignId") campaignId: string,
	) {
		return this.campaignService.runCampaign(ctx.user.id, campaignId);
	}

	@Mutation({ input: optOutRecipientInput })
	async optOutRecipient(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof optOutRecipientInput>,
	) {
		return this.campaignService.optOut(ctx.user.id, input.recipient);
	}

	@Mutation({ input: setAutoCreateInput })
	async setAutoCreate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAutoCreateInput>,
	) {
		await this.connection.setAutoCreate(
			ctx.user.id,
			input.source,
			input.enabled,
		);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({ input: suppressDomainInput })
	async suppressDomain(@Input() input: z.infer<typeof suppressDomainInput>) {
		return this.connection.suppressDomain(input.domain, {
			reason: input.reason,
			purge: input.purge,
		});
	}

	@Query({ input: threadInput })
	async thread(@Input("threadId") threadId: string) {
		return this.conversations.thread(threadId);
	}

	@Query({ input: calendarEventInput })
	async event(@Input("eventId") eventId: string) {
		return this.conversations.event(eventId);
	}
}
