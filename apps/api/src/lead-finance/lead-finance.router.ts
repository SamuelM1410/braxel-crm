import { Inject } from "@nestjs/common";
import { Query, Router, UseMiddlewares } from "nestjs-trpc";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { LeadFinanceService } from "./lead-finance.service";

@Router({ alias: "leadFinance" })
@UseMiddlewares(AuthMiddleware)
export class LeadFinanceRouter {
	constructor(
		@Inject(LeadFinanceService)
		private readonly leadFinance: LeadFinanceService,
	) {}

	@Query()
	async portfolio() {
		return this.leadFinance.portfolio();
	}
}
