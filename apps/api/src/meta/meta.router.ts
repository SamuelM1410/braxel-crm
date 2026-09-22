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
import {
	metaThreadsInput,
	refreshMetaSubscriptionsInput,
	sendMetaReplyInput,
	setMetaAssistantInput,
} from "./meta.contracts";
import { MetaConnectionService } from "./meta-connection.service";

@Router({ alias: "meta" })
@UseMiddlewares(AuthMiddleware)
export class MetaRouter {
	constructor(
		@Inject(MetaConnectionService)
		private readonly connection: MetaConnectionService,
	) {}

	@Query()
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation({ input: setMetaAssistantInput })
	setAssistant(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setMetaAssistantInput>,
	) {
		return this.connection.setAssistant(ctx.user.id, input.enabled);
	}

	@Query({ input: metaThreadsInput })
	threads(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof metaThreadsInput>,
	) {
		return this.connection.threads(ctx.user.id, input.limit);
	}

	@Mutation({ input: refreshMetaSubscriptionsInput })
	refreshSubscriptions(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof refreshMetaSubscriptionsInput>,
	) {
		return this.connection.refreshSubscriptions(ctx.user.id, input.pageId);
	}

	@Mutation({ input: sendMetaReplyInput })
	sendReply(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof sendMetaReplyInput>,
	) {
		return this.connection.sendReply(ctx.user.id, input.threadId, input.body);
	}

	@Mutation()
	disconnect(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.disconnect(ctx.user.id);
	}
}
