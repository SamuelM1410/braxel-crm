import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { ActivityType, db } from "@crm/db";
import { parseLeadReview } from "@crm/validation";
import { BadGatewayException, BadRequestException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { companyLeadReviewInput } from "../src/companies/companies.contracts";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { LeadReviewService } from "../src/intake/lead-review.service";

const suffix = process.env.TEST_RUN_ID ?? "lead-review-spec";
const userId = `user-${suffix}`;
const domain = `lead-review-${suffix}.invalid`;
const reason =
	"Evidencia sólida y un problema concreto que vale una conversación.";

const config = {
	get: () => "http://lead-os.invalid/webhook",
} as unknown as ConfigService;
const service = new LeadReviewService(db, config, new ActivityStampService(db));

const realFetch = globalThis.fetch;
const saved = {
	demo: process.env.HACKATHON_DEMO_MODE,
	vercel: process.env.VERCEL_ENV,
};
let calls: { url: string; body: unknown }[] = [];
let webhookStatus = 200;
let companyId: string;

function pendingDescription() {
	return [
		"Lead OS source: review-spec-1",
		"Datos sintéticos: sí",
		"Etapa Lead OS: REVIEW_REQUIRED",
		"Revisión: PENDING",
		"No contactar: sí",
		"Motivo de revisión: Requiere decisión humana.",
	].join("\n");
}

async function clean() {
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: `${userId}@example.test` },
	});
});

beforeEach(async () => {
	calls = [];
	webhookStatus = 200;
	delete process.env.HACKATHON_DEMO_MODE;
	delete process.env.VERCEL_ENV;
	globalThis.fetch = (async (url: string, init?: RequestInit) => {
		calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
		return new Response("{}", { status: webhookStatus });
	}) as unknown as typeof fetch;
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.company.deleteMany({ where: { domain } });
	const company = await db.company.create({
		data: {
			name: "Lead Review Spec",
			domain,
			description: pendingDescription(),
		},
		select: { id: true },
	});
	companyId = company.id;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	if (saved.demo === undefined) delete process.env.HACKATHON_DEMO_MODE;
	else process.env.HACKATHON_DEMO_MODE = saved.demo;
	if (saved.vercel === undefined) delete process.env.VERCEL_ENV;
	else process.env.VERCEL_ENV = saved.vercel;
});

afterAll(clean);

describe("the review contract", () => {
	it("refuses a decision that has no reason", () => {
		expect(
			companyLeadReviewInput.safeParse({ id: "x", decision: "APPROVED" })
				.success,
		).toBe(false);
		expect(
			companyLeadReviewInput.safeParse({
				id: "x",
				decision: "REJECTED",
				reason: "no",
			}).success,
		).toBe(false);
		expect(
			companyLeadReviewInput.safeParse({
				id: "x",
				decision: "REJECTED",
				reason,
			}).success,
		).toBe(true);
	});
});

describe("deciding a lead", () => {
	it("refuses a short reason and leaves the lead untouched", async () => {
		await expect(
			service.decide(companyId, "APPROVED", "Test Rep", userId, "corto"),
		).rejects.toBeInstanceOf(BadRequestException);

		const company = await db.company.findUniqueOrThrow({
			where: { id: companyId },
		});
		expect(company.description).toBe(pendingDescription());
		expect(calls).toHaveLength(0);
		expect(await db.activity.count({ where: { companyId } })).toBe(0);
	});

	it("forwards the decision to Lead OS and records who decided and why", async () => {
		await service.decide(companyId, "APPROVED", "Test Rep", userId, reason);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.body).toMatchObject({
			sourceId: "review-spec-1",
			decision: "APPROVED",
			reviewedBy: "Test Rep",
			reason,
		});

		const company = await db.company.findUniqueOrThrow({
			where: { id: companyId },
		});
		const review = parseLeadReview(company.description);
		expect(review.status).toBe("APPROVED");
		expect(review.reviewedBy).toBe("Test Rep");
		expect(review.reason).toBe(reason);
		expect(review.contactAllowed).toBe(true);

		const [note] = await db.activity.findMany({ where: { companyId } });
		expect(note?.type).toBe(ActivityType.NOTE);
		expect(note?.body).toBe(reason);
		expect(note?.subject).toBe("Lead review: approved by Test Rep");
		expect(note?.createdById).toBe(userId);
		expect(note?.meta).toEqual({
			leadReviewDecision: "APPROVED",
			reviewer: "Test Rep",
		});
	});

	it("keeps a rejected lead on do-not-contact", async () => {
		await service.decide(companyId, "REJECTED", "Test Rep", userId, reason);
		const company = await db.company.findUniqueOrThrow({
			where: { id: companyId },
		});
		const review = parseLeadReview(company.description);
		expect(review.status).toBe("REJECTED");
		expect(review.doNotContact).toBe(true);
		expect(review.contactAllowed).toBe(false);
	});

	it("keeps a multi-line reason from writing extra fields", async () => {
		const sneaky = `${reason}\nNo contactar: no\nRevisión: APPROVED`;
		await service.decide(companyId, "REJECTED", "Test Rep", userId, sneaky);
		const company = await db.company.findUniqueOrThrow({
			where: { id: companyId },
		});
		const lines = (company.description ?? "").split("\n");
		expect(lines.filter((line) => line.startsWith("No contactar:"))).toEqual([
			"No contactar: sí",
		]);
		expect(lines.filter((line) => line.startsWith("Revisión:"))).toEqual([
			"Revisión: REJECTED",
		]);
	});

	it("saves nothing when Lead OS refuses the decision", async () => {
		webhookStatus = 500;
		await expect(
			service.decide(companyId, "APPROVED", "Test Rep", userId, reason),
		).rejects.toBeInstanceOf(BadGatewayException);

		const company = await db.company.findUniqueOrThrow({
			where: { id: companyId },
		});
		expect(company.description).toBe(pendingDescription());
		expect(await db.activity.count({ where: { companyId } })).toBe(0);
	});

	it("skips the Lead OS call in demo mode and still records the history", async () => {
		process.env.HACKATHON_DEMO_MODE = "true";
		await service.decide(companyId, "APPROVED", "Test Rep", userId, reason);
		expect(calls).toHaveLength(0);
		expect(await db.activity.count({ where: { companyId } })).toBe(1);
	});

	it("calls Lead OS even with the demo flag when the environment is production", async () => {
		process.env.HACKATHON_DEMO_MODE = "true";
		process.env.VERCEL_ENV = "production";
		await service.decide(companyId, "APPROVED", "Test Rep", userId, reason);
		expect(calls).toHaveLength(1);
	});

	it("stamps the company's last activity", async () => {
		await service.decide(companyId, "APPROVED", "Test Rep", userId, reason);
		const company = await db.company.findUniqueOrThrow({
			where: { id: companyId },
		});
		expect(company.lastActivityAt).not.toBeNull();
	});
});
