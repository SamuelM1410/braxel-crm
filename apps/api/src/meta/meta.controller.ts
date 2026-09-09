import type { IncomingMessage } from "node:http";
import type { auth } from "@crm/auth";
import {
	BadRequestException,
	Controller,
	Get,
	HttpCode,
	Post,
	Query,
	Req,
	Res,
} from "@nestjs/common";
import {
	AllowAnonymous,
	Session,
	type UserSession,
} from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { MetaConnectionService } from "./meta-connection.service";
import { MetaWebhookService } from "./meta-webhook.service";

type CrmSession = UserSession<typeof auth>;

@Controller("api/meta")
export class MetaController {
	constructor(
		private readonly connections: MetaConnectionService,
		private readonly webhooks: MetaWebhookService,
	) {}

	@Get("connect")
	async connect(
		@Session() session: CrmSession,
		@Query("returnUrl") returnUrl: string | undefined,
		@Res() response: Response,
	) {
		const destination = returnUrl ?? "/braxel/settings/connections/meta";
		response.redirect(
			await this.connections.begin(session.user.id, destination),
		);
	}

	@Get("callback")
	@AllowAnonymous()
	async callback(
		@Query("state") state: string | undefined,
		@Query("code") code: string | undefined,
		@Query("error") error: string | undefined,
		@Res() response: Response,
	) {
		if (error || !state || !code)
			throw new BadRequestException(
				error ?? "Meta did not return an authorization code.",
			);
		const returnUrl = await this.connections.complete(state, code);
		response.redirect(
			new URL(
				`${returnUrl}${returnUrl.includes("?") ? "&" : "?"}connected=meta`,
				process.env.APP_URL?.split(",")[0] ?? "http://localhost:3000",
			).toString(),
		);
	}

	@Get("webhook")
	@AllowAnonymous()
	verify(
		@Query("hub.mode") mode: string | undefined,
		@Query("hub.verify_token") token: string | undefined,
		@Query("hub.challenge") challenge: string | undefined,
		@Res() response: Response,
	) {
		if (!this.webhooks.verify(mode, token) || !challenge)
			return response.sendStatus(403);
		return response.status(200).send(challenge);
	}

	@Post("webhook")
	@AllowAnonymous()
	@HttpCode(200)
	async receive(@Req() request: IncomingMessage) {
		const raw = await read(request, 2_000_000);
		await this.webhooks.receive(raw, request.headers["x-hub-signature-256"]);
		return "EVENT_RECEIVED";
	}
}

async function read(request: IncomingMessage, limit: number): Promise<Buffer> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > limit)
			throw new BadRequestException("Meta webhook body is too large.");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks);
}
