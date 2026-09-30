import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { IntakeModule } from "../intake/intake.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ScrapersRouter } from "./scrapers.router";
import { ScrapersService } from "./scrapers.service";

@Module({
	imports: [AgentModule, IntakeModule, TrpcModule],
	providers: [ScrapersRouter, ScrapersService],
})
export class ScrapersModule {}
