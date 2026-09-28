import { Controller, Get, HttpCode, Post, Query, Res } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { EmailUnsubscribeService } from "./email-unsubscribe.service";

@Controller("api/email")
export class EmailUnsubscribeController {
	constructor(private readonly service: EmailUnsubscribeService) {}

	@Get("unsubscribe")
	@AllowAnonymous()
	async page(
		@Query("token") token: string | undefined,
		@Res() response: Response,
	) {
		if (!this.service.isValid(token)) {
			return response
				.status(400)
				.type("html")
				.send("Invalid unsubscribe link.");
		}
		const safeToken = token?.replace(/[^A-Za-z0-9._~-]/g, "") ?? "";
		return response
			.status(200)
			.type("html")
			.send(
				'<!doctype html><html lang="es"><meta charset="utf-8"><title>Confirmar baja</title><body><h1>¿Quieres dejar de recibir mensajes?</h1><form method="post" action="/api/email/unsubscribe?token=' +
					safeToken +
					'"><button type="submit">Confirmar baja</button></form></body></html>',
			);
	}

	@Post("unsubscribe")
	@AllowAnonymous()
	@HttpCode(204)
	async oneClick(@Query("token") token: string | undefined) {
		await this.service.unsubscribe(token);
	}
}
