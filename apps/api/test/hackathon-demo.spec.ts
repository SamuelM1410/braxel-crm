import { describe, expect, it } from "bun:test";
import {
	hackathonDemoEnabled,
	hackathonDemoRequested,
} from "../src/hackathon-demo/hackathon-demo.config";

describe("hackathon demo mode", () => {
	it("is off unless the flag is exactly true", () => {
		expect(hackathonDemoEnabled({})).toBe(false);
		expect(hackathonDemoEnabled({ HACKATHON_DEMO_MODE: "false" })).toBe(false);
		expect(hackathonDemoEnabled({ HACKATHON_DEMO_MODE: "1" })).toBe(false);
	});

	it("is on in development and test", () => {
		expect(
			hackathonDemoEnabled({
				HACKATHON_DEMO_MODE: "true",
				NODE_ENV: "development",
			}),
		).toBe(true);
		expect(
			hackathonDemoEnabled({ HACKATHON_DEMO_MODE: "true", NODE_ENV: "test" }),
		).toBe(true);
	});

	it("is ignored in production, whichever variable names it", () => {
		const flag = { HACKATHON_DEMO_MODE: "true" };
		expect(hackathonDemoEnabled({ ...flag, NODE_ENV: "production" })).toBe(
			false,
		);
		expect(hackathonDemoEnabled({ ...flag, VERCEL_ENV: "production" })).toBe(
			false,
		);
		expect(hackathonDemoRequested({ ...flag, NODE_ENV: "production" })).toBe(
			true,
		);
	});
});
