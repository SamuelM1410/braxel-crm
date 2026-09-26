import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { MetaClient } from "./meta.client";
import { MetaController } from "./meta.controller";
import { MetaRouter } from "./meta.router";
import { MetaConnectionService } from "./meta-connection.service";
import { MetaTokenService } from "./meta-token.service";
import { MetaWebhookService } from "./meta-webhook.service";
import { WhatsAppWebController } from "./whatsapp-web.controller";
import { WhatsAppWebService } from "./whatsapp-web.service";

@Module({
	imports: [TrpcModule, AgentModule],
	controllers: [MetaController, WhatsAppWebController],
	providers: [
		MetaClient,
		MetaConnectionService,
		MetaRouter,
		MetaTokenService,
		MetaWebhookService,
		WhatsAppWebService,
	],
})
export class MetaModule {}
