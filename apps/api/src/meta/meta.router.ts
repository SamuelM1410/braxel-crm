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
import { setMetaAssistantInput } from "./meta.contracts";
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

	@Mutation()
	disconnect(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.disconnect(ctx.user.id);
	}
}
