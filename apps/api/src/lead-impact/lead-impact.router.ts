import { Inject } from "@nestjs/common";
import { Query, Router, UseMiddlewares } from "nestjs-trpc";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { LeadImpactService } from "./lead-impact.service";

@Router({ alias: "leadImpact" })
@UseMiddlewares(AuthMiddleware)
export class LeadImpactRouter {
	constructor(
		@Inject(LeadImpactService) private readonly leadImpact: LeadImpactService,
	) {}

	@Query()
	async summary() {
		return this.leadImpact.summary();
	}
}
