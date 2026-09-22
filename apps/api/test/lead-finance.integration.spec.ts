import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { LeadFinanceService } from "../src/lead-finance/lead-finance.service";

const suffix = process.env.TEST_RUN_ID ?? "lead-finance-spec";
const domains = ["ok", "broken", "plain"].map(
	(name) => `${name}-${suffix}.invalid`,
);
const service = new LeadFinanceService(db);

const dossier = (scores: Record<string, number>) =>
	`Dossier Lead OS: ${JSON.stringify({ scores })}`;

async function clean() {
	await db.company.deleteMany({ where: { domain: { in: domains } } });
}

let before: Awaited<ReturnType<typeof service.portfolio>>;

beforeAll(async () => {
	await clean();
	before = await service.portfolio();
	await db.company.create({
		data: {
			domain: domains[0],
			name: "Finance Ok",
			description: [
				"Lead OS source: finance-ok",
				"Datos sintéticos: sí",
				"Revisión: APPROVED",
				dossier({
					evidence_quality: 82,
					commercial_opportunity: 74,
					contact_priority: 88,
				}),
			].join("\n"),
		},
	});
	await db.company.create({
		data: {
			domain: domains[1],
			name: "Finance Broken",
			description: [
				"Lead OS source: finance-broken",
				dossier({ commercial_opportunity: 500 }),
			].join("\n"),
		},
	});
	await db.company.create({
		data: { domain: domains[2], name: "Finance Plain", description: "Note" },
	});
});

afterAll(clean);

describe("lead finance portfolio", () => {
	it("returns the scores of every lead with a valid dossier", async () => {
		const after = await service.portfolio();
		expect(after.leads.length - before.leads.length).toBe(1);
		const lead = after.leads.find((row) => row.name === "Finance Ok");
		expect(lead).toMatchObject({
			status: "APPROVED",
			synthetic: true,
			scores: { opportunity: 74, priority: 88 },
		});
	});

	it("counts a dossier without valid scores instead of guessing a value", async () => {
		const after = await service.portfolio();
		expect(after.leadsWithoutScores - before.leadsWithoutScores).toBe(1);
		expect(after.leads.some((row) => row.name === "Finance Broken")).toBe(
			false,
		);
	});

	it("ignores companies that are not Lead OS leads", async () => {
		const after = await service.portfolio();
		expect(after.leads.some((row) => row.name === "Finance Plain")).toBe(false);
	});
});
