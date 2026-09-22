import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { LeadFinanceRouter } from "./lead-finance.router";
import { LeadFinanceService } from "./lead-finance.service";

@Module({
	imports: [TrpcModule],
	providers: [LeadFinanceRouter, LeadFinanceService],
})
export class LeadFinanceModule {}
