import { describe, expect, it } from "bun:test";
import { isWebUrl, MAX_URL_LENGTH, safeHref, webUrl } from "../src/index";

const DANGEROUS = [
	"javascript:alert(document.cookie)",
	"JavaScript:alert(1)",
	"  javascript:alert(1)  ",
	"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
	"vbscript:msgbox(1)",
	"file:///etc/passwd",
	"blob:https://example.com/abc",
];

const SAFE = [
	"https://example.com/page?q=1#a",
	"http://localhost:3000/path",
	"HTTPS://EXAMPLE.COM",
];

describe("isWebUrl", () => {
	it("refuses every scheme a browser would execute or read locally", () => {
		for (const value of DANGEROUS) {
			expect(isWebUrl(value), value).toBe(false);
		}
	});

	it("accepts http and https", () => {
		for (const value of SAFE) {
			expect(isWebUrl(value), value).toBe(true);
		}
	});

	it("refuses what is not a link at all", () => {
		for (const value of ["", "   ", "not a url", "example.com", null, 7, {}]) {
			expect(isWebUrl(value)).toBe(false);
		}
	});

	it("refuses a link longer than the column holds", () => {
		expect(isWebUrl(`https://example.com/${"a".repeat(MAX_URL_LENGTH)}`)).toBe(
			false,
		);
	});
});

describe("safeHref", () => {
	it("hands back a trimmed safe link and null for anything else", () => {
		expect(safeHref("  https://example.com/x  ")).toBe("https://example.com/x");
		expect(safeHref("javascript:alert(1)")).toBeNull();
		expect(safeHref(null)).toBeNull();
		expect(safeHref(undefined)).toBeNull();
	});
});

describe("the webUrl schema", () => {
	it("rejects a dangerous scheme that z.string().url() would accept", () => {
		for (const value of DANGEROUS) {
			expect(webUrl.safeParse(value).success, value).toBe(false);
		}
		expect(webUrl.parse("  https://example.com  ")).toBe("https://example.com");
	});
});
