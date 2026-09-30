import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { WhatsAppWebService } from "./whatsapp-web.service";

@Controller("api/whatsapp-web")
export class WhatsAppWebController {
	constructor(private readonly whatsapp: WhatsAppWebService) {}

	@Post("inbound")
	@AllowAnonymous()
	@HttpCode(200)
	inbound(
		@Body() body: unknown,
		@Headers("authorization") authorization?: string,
	) {
		return this.whatsapp.receive(body, authorization);
	}
}
