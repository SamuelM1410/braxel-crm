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
	scraperHistoryInput,
	scraperImportInput,
	scraperRunInput,
} from "./scrapers.contracts";
import { ScrapersService } from "./scrapers.service";

@Router({ alias: "scrapers" })
@UseMiddlewares(AuthMiddleware)
export class ScrapersRouter {
	constructor(
		@Inject(ScrapersService) private readonly scrapers: ScrapersService,
	) {}

	@Query()
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.scrapers.status(ctx.user.id);
	}

	@Query({ input: scraperHistoryInput })
	async history(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof scraperHistoryInput>,
	) {
		return this.scrapers.history(input.limit, ctx.user.id);
	}

	@Mutation({ input: scraperRunInput })
	async run(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof scraperRunInput>,
	) {
		return this.scrapers.run(input, ctx.user.id);
	}

	@Mutation({ input: scraperImportInput })
	async import(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.scrapers.importRun(id, ctx.user.id);
	}
}
