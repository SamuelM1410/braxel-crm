import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { WhatsAppWebController } from "./whatsapp-web.controller";
import { WhatsAppWebService } from "./whatsapp-web.service";

@Module({
	imports: [AgentModule],
	controllers: [WhatsAppWebController],
	providers: [WhatsAppWebService],
})
export class WhatsAppWebModule {}
