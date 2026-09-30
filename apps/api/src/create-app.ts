import type { IncomingMessage, ServerResponse } from "node:http";
import {
	BadRequestException,
	PayloadTooLargeException,
	ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
	ExpressAdapter,
	type NestExpressApplication,
} from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ContextLogger } from "./logging/context-logger";

export async function createApp(): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(
		AppModule,
		new ExpressAdapter(),
		{ bodyParser: false, logger: new ContextLogger() },
	);

	// The API intentionally disables Nest's global body parser. WhatsApp Web
	// sends ordinary JSON, so parse only this route with a bounded native
	// middleware instead of adding another runtime dependency to the API.
	app.use("/api/whatsapp-web/inbound", parseWhatsAppBody);

	app.use(helmet());
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	return app;
}

type RequestWithBody = IncomingMessage & { body?: unknown };

function parseWhatsAppBody(
	request: RequestWithBody,
	_response: ServerResponse,
	next: (error?: unknown) => void,
) {
	const chunks: Buffer[] = [];
	let size = 0;
	let failed = false;
	request.on("data", (chunk: Buffer | string) => {
		if (failed) return;
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > 256_000) {
			failed = true;
			next(new PayloadTooLargeException("WhatsApp Web body is too large."));
			return;
		}
		chunks.push(buffer);
	});
	request.on("end", () => {
		if (failed) return;
		try {
			request.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
			failed = true;
			next();
		} catch {
			failed = true;
			next(new BadRequestException("Invalid WhatsApp Web JSON."));
		}
	});
	request.on("error", (error) => {
		if (failed) return;
		failed = true;
		next(error);
	});
}
