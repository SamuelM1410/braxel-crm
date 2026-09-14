import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";

type TokenResponse = {
	access_token: string;
	token_type?: string;
	expires_in?: number;
};
type Me = { id: string; name?: string };
type Page = {
	id: string;
	name: string;
	access_token: string;
	instagram_business_account?: { id: string; username?: string };
};

@Injectable()
export class MetaClient {
	constructor(
		private readonly config: ConfigService<EnvironmentVariables, true>,
	) {}

	configured() {
		return Boolean(
			this.appId() &&
			this.appSecret() &&
			this.config.get("META_WEBHOOK_VERIFY_TOKEN", { infer: true }) &&
			this.config.get("META_TOKEN_ENCRYPTION_KEY", { infer: true }),
		);
	}

	authorizeUrl(state: string) {
		const url = new URL(
			`https://www.facebook.com/${this.version()}/dialog/oauth`,
		);
		url.searchParams.set("client_id", this.appId());
		url.searchParams.set("redirect_uri", this.callbackUrl());
		url.searchParams.set("state", state);
		url.searchParams.set("response_type", "code");
		url.searchParams.set(
			"scope",
			[
				"pages_show_list",
				"pages_read_engagement",
				"pages_manage_metadata",
				"pages_messaging",
				"business_management",
			].join(","),
		);
		return url.toString();
	}

	async exchange(code: string): Promise<TokenResponse> {
		const short = await this.get<TokenResponse>("oauth/access_token", {
			client_id: this.appId(),
			client_secret: this.appSecret(),
			redirect_uri: this.callbackUrl(),
			code,
		});
		return this.get<TokenResponse>("oauth/access_token", {
			grant_type: "fb_exchange_token",
			client_id: this.appId(),
			client_secret: this.appSecret(),
			fb_exchange_token: short.access_token,
		});
	}

	me(token: string) {
		return this.get<Me>("me", { fields: "id,name", access_token: token });
	}
	async pages(token: string) {
		const result = await this.get<{ data?: Page[] }>("me/accounts", {
			fields: "id,name,access_token,instagram_business_account{id,username}",
			access_token: token,
		});
		return result.data ?? [];
	}

	async assignedPages(token: string) {
		const result = await this.get<{ data?: Page[] }>("me/assigned_pages", {
			fields: "id,name,access_token,instagram_business_account{id,username}",
			access_token: token,
		});
		return result.data ?? [];
	}

	async subscribePage(pageId: string, pageToken: string) {
		return this.post(`${pageId}/subscribed_apps`, {
			subscribed_fields:
				"messages,messaging_postbacks,message_deliveries,message_reads",
			access_token: pageToken,
		});
	}

	async send(
		pageId: string,
		pageToken: string,
		recipientId: string,
		text: string,
	) {
		return this.post(`${pageId}/messages`, {
			recipient: { id: recipientId },
			messaging_type: "RESPONSE",
			message: { text },
			access_token: pageToken,
		});
	}

	callbackUrl() {
		return new URL("/api/meta/callback", this.apiUrl()).toString();
	}
	apiUrl() {
		return (
			this.config.get("API_URL", { infer: true }) ?? "http://localhost:3001"
		);
	}

	private version() {
		return this.config.get("META_GRAPH_VERSION", { infer: true }) ?? "v24.0";
	}
	private appId() {
		return this.config.get("META_APP_ID", { infer: true }) ?? "";
	}
	private appSecret() {
		return this.config.get("META_APP_SECRET", { infer: true }) ?? "";
	}
	private base(path: string) {
		return `https://graph.facebook.com/${this.version()}/${path}`;
	}

	private async get<T>(
		path: string,
		query: Record<string, string>,
	): Promise<T> {
		const url = new URL(this.base(path));
		for (const [key, value] of Object.entries(query))
			url.searchParams.set(key, value);
		const response = await fetch(url);
		return this.read<T>(response);
	}

	private async post<T = Record<string, unknown>>(
		path: string,
		body: Record<string, unknown>,
	): Promise<T> {
		const response = await fetch(this.base(path), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		return this.read<T>(response);
	}

	private async read<T>(response: Response): Promise<T> {
		const value = (await response.json()) as T & {
			error?: { message?: string };
		};
		if (!response.ok || value.error)
			throw new Error(
				value.error?.message ?? `Meta API returned ${response.status}`,
			);
		return value;
	}
}
