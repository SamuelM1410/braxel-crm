import { describe, expect, it } from "bun:test";
import { normalizePhone, validatePhone } from "../src/crm/values";

describe("contact phone validation", () => {
	it("normalizes Colombian mobile numbers", () => {
		expect(normalizePhone("300 018 2535")).toBe("+573000182535");
		expect(validatePhone("+57 300 018 2535").reason).toBe("VALID");
	});

	it("rejects placeholder and sequential values", () => {
		expect(normalizePhone("6666666")).toBeNull();
		expect(normalizePhone("1111111111")).toBeNull();
		expect(validatePhone("1234567890").reason).toBe("SEQUENTIAL_DIGITS");
	});

	it("does not treat an ordinary phone as WhatsApp proof", () => {
		expect(normalizePhone("6015550182")).toBe("+576015550182");
	});
});
