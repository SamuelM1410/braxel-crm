import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { MetaClient } from "./meta.client";
import { MetaController } from "./meta.controller";
import { MetaRouter } from "./meta.router";
import { MetaConnectionService } from "./meta-connection.service";
import { MetaTokenService } from "./meta-token.service";
import { MetaWebhookService } from "./meta-webhook.service";

@Module({
	imports: [TrpcModule],
	controllers: [MetaController],
	providers: [
		MetaClient,
		MetaConnectionService,
		MetaRouter,
		MetaTokenService,
		MetaWebhookService,
	],
})
export class MetaModule {}
