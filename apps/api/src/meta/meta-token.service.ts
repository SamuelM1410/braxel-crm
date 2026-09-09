import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";

@Injectable()
export class MetaTokenService {
	constructor(
		private readonly config: ConfigService<EnvironmentVariables, true>,
	) {}

	encrypt(value: string): string {
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
		const ciphertext = Buffer.concat([
			cipher.update(value, "utf8"),
			cipher.final(),
		]);
		return [
			"v1",
			iv.toString("base64url"),
			cipher.getAuthTag().toString("base64url"),
			ciphertext.toString("base64url"),
		].join(".");
	}

	decrypt(value: string): string {
		const [version, iv, tag, ciphertext] = value.split(".");
		if (version !== "v1" || !iv || !tag || !ciphertext)
			throw new Error("Invalid encrypted Meta token");
		const decipher = createDecipheriv(
			"aes-256-gcm",
			this.key(),
			Buffer.from(iv, "base64url"),
		);
		decipher.setAuthTag(Buffer.from(tag, "base64url"));
		return Buffer.concat([
			decipher.update(Buffer.from(ciphertext, "base64url")),
			decipher.final(),
		]).toString("utf8");
	}

	private key(): Buffer {
		const secret = this.config.get("META_TOKEN_ENCRYPTION_KEY", {
			infer: true,
		});
		if (!secret)
			throw new ServiceUnavailableException(
				"Meta token encryption is not configured.",
			);
		return createHash("sha256").update(secret).digest();
	}
}
