import { afterEach, describe, expect, it, mock } from "bun:test";
import { MetaClient } from "../src/meta/meta.client";

function client(values: Record<string, string | undefined>) {
	return new MetaClient({
		get: (key: string) => values[key],
	} as never);
}

describe("MetaClient", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});
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

	it("keeps the direct scope flow even when a legacy configuration is present", () => {
		const instance = client({
			META_APP_ID: "app-id",
			META_LOGIN_CONFIG_ID: "config-1",
			API_URL: "https://braxel-api.vercel.app",
			META_WEBHOOK_VERIFY_TOKEN: "verify",
			META_TOKEN_ENCRYPTION_KEY: "x".repeat(32),
		});
		const url = new URL(instance.authorizeUrl("state-1"));

		expect(url.searchParams.get("config_id")).toBeNull();
		expect(url.searchParams.get("scope")).toContain(
			"instagram_manage_messages",
		);
	});

	it("verifies the current app subscription", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({
				data: [
					{
						id: "app-id",
						subscribed_fields: ["messages", "messaging_postbacks"],
					},
				],
			}),
		) as unknown as typeof fetch;
		const instance = client({ META_APP_ID: "app-id" });

		await expect(instance.pageSubscription("page-1", "token")).resolves.toEqual(
			{
				active: true,
				fields: ["messages", "messaging_postbacks"],
			},
		);
	});

	it("reports a missing app subscription", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ data: [] }),
		) as unknown as typeof fetch;
		const instance = client({ META_APP_ID: "app-id" });

		await expect(instance.pageSubscription("page-1", "token")).resolves.toEqual(
			{
				active: false,
				fields: [],
			},
		);
	});

	it("sends only a response message to an existing recipient", async () => {
		let request: RequestInit | undefined;
		globalThis.fetch = mock(async (_url, init) => {
			request = init;
			return Response.json({
				recipient_id: "person-1",
				message_id: "message-1",
			});
		}) as unknown as typeof fetch;
		const instance = client({ META_APP_ID: "app-id" });

		const result = await instance.send("page-1", "token", "person-1", "Hello");
		const body = JSON.parse(String(request?.body));

		expect(result.message_id).toBe("message-1");
		expect(body.messaging_type).toBe("RESPONSE");
		expect(body.recipient.id).toBe("person-1");
		expect(body.message.text).toBe("Hello");
	});
});
