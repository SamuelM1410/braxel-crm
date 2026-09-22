import { describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { MetaWebhookService } from "../src/meta/meta-webhook.service";

const secret = "meta-test-secret";

function fixture(object: "page" | "instagram", recipientId: string) {
	return Buffer.from(
		JSON.stringify({
			object,
			entry: [
				{
					id: recipientId,
					messaging: [
						{
							sender: { id: "lead-1" },
							recipient: { id: recipientId },
							timestamp: Date.now(),
							message: { mid: "message-1", text: "Necesito una web" },
						},
					],
				},
			],
		}),
	);
}

function signature(raw: Buffer) {
	return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}

function service(options?: { duplicate?: boolean; enabled?: boolean }) {
	let createdData: Record<string, unknown> | undefined;
	let triggeredData: Record<string, unknown> | undefined;
	const create = mock(async (input: { data: Record<string, unknown> }) => {
		createdData = input.data;
		return { id: "stored-message" };
	});
	const trigger = mock(async (input: Record<string, unknown>) => {
		triggeredData = input;
	});
	const db = {
		metaPage: {
			findFirst: mock(async () => ({
				pageId: "page-1",
				instagramBusinessAccountId: "ig-1",
				connection: { replyAssistantEnabled: options?.enabled ?? true },
			})),
		},
		socialThread: {
			findUnique: mock(async () =>
				options?.duplicate ? { id: "thread-1" } : null,
			),
			upsert: mock(
				async ({ create: value }: { create: Record<string, unknown> }) => ({
					id: "thread-1",
					...value,
				}),
			),
		},
		socialMessage: {
			findUnique: mock(async () =>
				options?.duplicate ? { id: "stored-message" } : null,
			),
			create,
		},
	};
	const instance = new MetaWebhookService(
		db as never,
		{ get: () => secret } as never,
		{ socialMessageReceived: trigger } as never,
	);
	return {
		instance,
		create,
		trigger,
		createdData: () => createdData,
		triggeredData: () => triggeredData,
	};
}

describe("MetaWebhookService", () => {
	it("rejects an invalid Meta signature", async () => {
		const raw = fixture("page", "page-1");
		const { instance } = service();

		await expect(instance.receive(raw, "sha256=bad")).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});

	it("stores a Facebook inbound message and asks Eve for a draft", async () => {
		const raw = fixture("page", "page-1");
		const { instance, create, trigger, createdData, triggeredData } = service();

		await instance.receive(raw, signature(raw));

		expect(create).toHaveBeenCalledTimes(1);
		expect(createdData()?.direction).toBe("INBOUND");
		expect(trigger).toHaveBeenCalledTimes(1);
		expect(triggeredData()?.channel).toBe("FACEBOOK");
	});

	it("classifies a linked Instagram recipient", async () => {
		const raw = fixture("instagram", "ig-1");
		const { instance, triggeredData } = service();

		await instance.receive(raw, signature(raw));

		expect(triggeredData()?.channel).toBe("INSTAGRAM");
	});

	it("ignores a duplicate delivery", async () => {
		const raw = fixture("page", "page-1");
		const { instance, create, trigger } = service({ duplicate: true });

		await instance.receive(raw, signature(raw));

		expect(create).not.toHaveBeenCalled();
		expect(trigger).not.toHaveBeenCalled();
	});
});
