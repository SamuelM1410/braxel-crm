import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { WhatsAppWebService } from "./whatsapp-web.service";

@Controller("api/whatsapp-web")
export class WhatsAppWebController {
	constructor(private readonly whatsapp: WhatsAppWebService) {}

	@Get("health")
	@AllowAnonymous()
	health() {
		return this.whatsapp.health();
	}

	@Post("inbound")
	@AllowAnonymous()
	async inbound(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		this.whatsapp.assertAuthorization(authorization);
		return this.whatsapp.ingest(body);
	}
}
