import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { LeadImpactRouter } from "./lead-impact.router";
import { LeadImpactService } from "./lead-impact.service";

@Module({
	imports: [TrpcModule],
	providers: [LeadImpactRouter, LeadImpactService],
})
export class LeadImpactModule {}
