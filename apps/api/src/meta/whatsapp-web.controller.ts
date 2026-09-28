import type { auth } from "@crm/auth";
import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import {
	AllowAnonymous,
	OptionalAuth,
	Session,
	type UserSession,
} from "@thallesp/nestjs-better-auth";
import { WhatsAppWebService } from "./whatsapp-web.service";

type CrmSession = UserSession<typeof auth>;

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

	@Post("outbound")
	@AllowAnonymous()
	async outbound(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		this.whatsapp.assertAuthorization(authorization);
		return this.whatsapp.recordOutbound(body);
	}

	@Get("metrics")
	@OptionalAuth()
	async metrics(
		@Headers("authorization") authorization: string | undefined,
		@Session() session?: CrmSession,
	) {
		this.whatsapp.assertMetricsAuthorization(authorization, Boolean(session));
		return this.whatsapp.salesMetrics();
	}
}
