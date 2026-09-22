import { describe, expect, it } from "bun:test";
import { MetaClient } from "../src/meta/meta.client";

function client(values: Record<string, string | undefined>) {
	return new MetaClient({
		get: (key: string) => values[key],
	} as never);
}

describe("MetaClient", () => {
	it("requests Facebook and Instagram messaging scopes without a login configuration", () => {
		const instance = client({
			META_APP_ID: "app-id",
			API_URL: "https://braxel-api.vercel.app",
			META_WEBHOOK_VERIFY_TOKEN: "verify",
			META_TOKEN_ENCRYPTION_KEY: "x".repeat(32),
		});
		const url = new URL(instance.authorizeUrl("state-1"));

		expect(url.searchParams.get("scope")).toContain("pages_messaging");
		expect(url.searchParams.get("scope")).toContain("instagram_basic");
		expect(url.searchParams.get("scope")).toContain(
			"instagram_manage_messages",
		);
	});

	it("uses the configured login configuration when present", () => {
		const instance = client({
			META_APP_ID: "app-id",
			META_LOGIN_CONFIG_ID: "config-1",
			API_URL: "https://braxel-api.vercel.app",
			META_WEBHOOK_VERIFY_TOKEN: "verify",
			META_TOKEN_ENCRYPTION_KEY: "x".repeat(32),
		});
		const url = new URL(instance.authorizeUrl("state-1"));

		expect(url.searchParams.get("config_id")).toBe("config-1");
		expect(url.searchParams.has("scope")).toBe(false);
	});
});
