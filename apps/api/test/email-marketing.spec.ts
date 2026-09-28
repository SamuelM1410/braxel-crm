import { afterEach, describe, expect, test } from "bun:test";
import {
	createUnsubscribeToken,
	marketingBody,
	marketingHeaders,
	unsubscribeUrl,
	verifyUnsubscribeToken,
} from "../src/google/email-marketing";

const previous = {
	secret: process.env.EMAIL_UNSUBSCRIBE_SECRET,
	baseUrl: process.env.EMAIL_UNSUBSCRIBE_BASE_URL,
};

afterEach(() => {
	if (previous.secret === undefined)
		delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
	else process.env.EMAIL_UNSUBSCRIBE_SECRET = previous.secret;
	if (previous.baseUrl === undefined)
		delete process.env.EMAIL_UNSUBSCRIBE_BASE_URL;
	else process.env.EMAIL_UNSUBSCRIBE_BASE_URL = previous.baseUrl;
});

describe("email marketing safeguards", () => {
	test("signs and verifies a normalized unsubscribe token", () => {
		process.env.EMAIL_UNSUBSCRIBE_SECRET = "x".repeat(32);
		const token = createUnsubscribeToken(" Lead@Example.com ");
		expect(token).toBeString();
		expect(verifyUnsubscribeToken(token as string)).toBe("lead@example.com");
		expect(verifyUnsubscribeToken(token + "tampered")).toBeNull();
	});

	test("adds a public one-click URL and visible fallback", () => {
		process.env.EMAIL_UNSUBSCRIBE_SECRET = "x".repeat(32);
		process.env.EMAIL_UNSUBSCRIBE_BASE_URL = "https://api.example.test";
		const headers = marketingHeaders("lead@example.com");
		const body = marketingBody("Hola", "lead@example.com");
		expect(headers[0]).toStartWith(
			"List-Unsubscribe: <https://api.example.test/api/email/unsubscribe?token=",
		);
		expect(headers[1]).toBe(
			"List-Unsubscribe-Post: List-Unsubscribe=One-Click",
		);
		expect(body).toContain("Hola");
		expect(body).toContain(
			"https://api.example.test/api/email/unsubscribe?token=",
		);
		expect(unsubscribeUrl("lead@example.com")).toContain(
			"api/email/unsubscribe",
		);
	});
});
