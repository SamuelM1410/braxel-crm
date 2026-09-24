import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import { LEAD_IMPACT } from "../src/lead-impact/lead-impact.config";
import { LeadImpactService } from "../src/lead-impact/lead-impact.service";

const suffix = process.env.TEST_RUN_ID ?? "lead-impact-spec";
const userId = `user-${suffix}`;
const domains = ["pending", "approved", "rejected", "plain"].map(
	(name) => `${name}-${suffix}.invalid`,
);
const service = new LeadImpactService(db);

const dossier = JSON.stringify({
	generated_at: new Date().toISOString(),
	scores: {
		evidence_quality: 80,
		commercial_opportunity: 70,
		contact_priority: 60,
	},
	evidence: [
		{
			claim: "Perfil público con actividad comercial",
			source: `https://evidencia.invalid/${suffix}`,
			strength: 80,
		},
	],
	missing_evidence: ["Confirmar el volumen real"],
});

function lead(
	status: "PENDING" | "APPROVED" | "REJECTED",
	extra: string[] = [],
) {
	return [
		`Lead OS source: impact-${suffix}-${status}`,
		"Datos sintéticos: sí",
		"Etapa Lead OS: REVIEW_REQUIRED",
		`Revisión: ${status}`,
		`No contactar: ${status === "APPROVED" ? "no" : "sí"}`,
		...extra,
		`Dossier Lead OS: ${dossier}`,
	].join("\n");
}

async function clean() {
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.company.deleteMany({ where: { domain: { in: domains } } });
	await db.user.deleteMany({ where: { id: userId } });
}

let before: Awaited<ReturnType<typeof service.summary>>;

beforeAll(async () => {
	await clean();
	before = await service.summary();
	await db.user.create({
		data: { id: userId, name: "Test Rep", email: `${userId}@example.test` },
	});
	const rows = [
		{
			domain: domains[0],
			name: "Impact Pending",
			description: lead("PENDING"),
		},
		{
			domain: domains[1],
			name: "Impact Approved",
			description: lead("APPROVED", [
				"Revisado por: Ana",
				"Motivo de revisión: Evidencia sólida y problema concreto.",
			]),
		},
		{
			domain: domains[2],
			name: "Impact Rejected",
			description: lead("REJECTED", [
				"Revisado por: Ana",
				"Motivo de revisión: Parece una sede sin autonomía de compra.",
			]),
		},
		{ domain: domains[3], name: "Impact Plain", description: "Just a note" },
	];
	const created = [];
	for (const row of rows) {
		created.push(
			await db.company.create({ data: row, select: { id: true, name: true } }),
		);
	}
	for (const company of created.filter(
		(row) => row.name !== "Impact Pending" && row.name !== "Impact Plain",
	)) {
		await db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "Lead review: decided by Ana",
				body: "Motivo guardado en el historial.",
				companyId: company.id,
				createdById: userId,
				meta: { leadReviewDecision: "APPROVED", reviewer: "Ana" },
			},
		});
	}
});

afterAll(clean);

describe("lead impact summary", () => {
	it("counts reviewed, pending and synthetic leads and ignores other companies", async () => {
		const after = await service.summary();
		expect(after.totals.leads - before.totals.leads).toBe(3);
		expect(after.totals.approved - before.totals.approved).toBe(1);
		expect(after.totals.rejected - before.totals.rejected).toBe(1);
		expect(after.totals.pending - before.totals.pending).toBe(1);
		expect(after.totals.synthetic - before.totals.synthetic).toBe(3);
		expect(after.totals.reviewed).toBe(
			after.totals.approved + after.totals.rejected,
		);
	});

	it("counts the saved decisions that carry a reason", async () => {
		const after = await service.summary();
		expect(
			after.totals.documentedDecisions - before.totals.documentedDecisions,
		).toBe(2);
	});

	it("blocks every lead that is not approved", async () => {
		const after = await service.summary();
		expect(after.risk.contactsAllowed - before.risk.contactsAllowed).toBe(1);
		expect(after.risk.contactsBlocked - before.risk.contactsBlocked).toBe(2);
		expect(after.risk.contactsAllowed + after.risk.contactsBlocked).toBe(
			after.totals.leads,
		);
	});

	it("estimates the time saved only for the leads a person reviewed", async () => {
		const after = await service.summary();
		const { manualResearchMinutesPerLead, humanReviewMinutesPerLead } =
			LEAD_IMPACT.assumptions;
		expect(after.estimated.minutesSavedOnReviewed).toBe(
			after.totals.reviewed *
				(manualResearchMinutesPerLead - humanReviewMinutesPerLead),
		);
		expect(after.rates.coverage).toBeGreaterThan(0);
		expect(after.rates.coverage).toBeLessThanOrEqual(1);
	});

	it("measures the real wait to decide, and the reviewers who decided", async () => {
		const after = await service.summary();
		expect(after.measured.decisions - before.measured.decisions).toBe(2);
		expect(after.measured.reviewers).toContain("Ana");
		for (const minutes of [
			after.measured.medianMinutesToDecide,
			after.measured.fastestMinutesToDecide,
			after.measured.slowestMinutesToDecide,
		]) {
			expect(minutes).not.toBeNull();
			expect(minutes ?? -1).toBeGreaterThanOrEqual(0);
		}
		expect(after.measured.slowestMinutesToDecide ?? 0).toBeGreaterThanOrEqual(
			after.measured.fastestMinutesToDecide ?? 0,
		);
	});

	it("counts the evidence the dossier actually carries", async () => {
		const after = await service.summary();
		expect(after.measured.leadsWithEvidence).toBeGreaterThan(0);
		expect(after.measured.evidenceItems).toBeGreaterThanOrEqual(
			after.measured.leadsWithEvidence,
		);
	});

	it("lists each lead with its decision, reason and lock state", async () => {
		const { companies } = await service.summary();
		const approved = companies.find((row) => row.name === "Impact Approved");
		const pending = companies.find((row) => row.name === "Impact Pending");
		expect(approved).toMatchObject({
			status: "APPROVED",
			reviewedBy: "Ana",
			contactAllowed: true,
			synthetic: true,
			scores: { evidence: 80, opportunity: 70, priority: 60 },
		});
		expect(pending).toMatchObject({
			status: "PENDING",
			reviewedBy: null,
			reason: null,
			contactAllowed: false,
		});
		expect(companies.some((row) => row.name === "Impact Plain")).toBe(false);
	});
});
