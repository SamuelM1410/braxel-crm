import { describe, expect, it, mock } from "bun:test";
import { BadRequestException } from "@nestjs/common";
import { MetaConnectionService } from "../src/meta/meta-connection.service";

function setup(options?: {
	direction?: "INBOUND" | "OUTBOUND";
	sentAt?: Date;
	channel?: "FACEBOOK" | "INSTAGRAM" | "WHATSAPP";
}) {
	const send = mock(async () => ({
		recipient_id: "lead-1",
		message_id: "sent-1",
	}));
	const create = mock(() => ({ operation: "create" }));
	const update = mock(() => ({ operation: "update" }));
	const transaction = mock(async () => undefined);
	const db = {
		socialThread: {
			findUnique: mock(async () => ({
				id: "thread-1",
				channel: options?.channel ?? "FACEBOOK",
				externalSenderId: "lead-1",
				externalRecipientId: "page-1",
				messages: [
					{
						direction: options?.direction ?? "INBOUND",
						sentAt: options?.sentAt ?? new Date(),
					},
				],
			})),
			update,
		},
		metaPage: {
			findFirst: mock(async () => ({
				pageId: "page-1",
				encryptedPageAccessToken: "encrypted",
			})),
		},
		socialMessage: { create },
		$transaction: transaction,
	};
	const service = new MetaConnectionService(
		db as never,
		{ send } as never,
		{ decrypt: () => "page-token" } as never,
	);
	return { service, send, create, transaction };
}

describe("MetaConnectionService.sendReply", () => {
	it("sends and records a human-approved reply", async () => {
		const { service, send, create, transaction } = setup();

		await expect(
			service.sendReply("user-1", "thread-1", "Claro, agendemos una llamada."),
		).resolves.toEqual({ sent: true, messageId: "sent-1" });

		expect(send).toHaveBeenCalledTimes(1);
		expect(create).toHaveBeenCalledTimes(1);
		expect(transaction).toHaveBeenCalledTimes(1);
	});

	it("blocks a second reply until the customer writes again", async () => {
		const { service, send } = setup({ direction: "OUTBOUND" });

		await expect(
			service.sendReply("user-1", "thread-1", "Second message"),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(send).not.toHaveBeenCalled();
	});

	it("blocks replies outside Meta's 24-hour window", async () => {
		const { service, send } = setup({
			sentAt: new Date(Date.now() - 25 * 60 * 60_000),
		});

		await expect(
			service.sendReply("user-1", "thread-1", "Late message"),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(send).not.toHaveBeenCalled();
	});

	it("does not use the Meta sender for WhatsApp threads", async () => {
		const { service, send } = setup({ channel: "WHATSAPP" });

		await expect(
			service.sendReply("user-1", "thread-1", "Wrong channel"),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(send).not.toHaveBeenCalled();
	});
});
