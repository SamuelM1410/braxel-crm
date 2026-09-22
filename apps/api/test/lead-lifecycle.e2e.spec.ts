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
import {
	defaultAssumptions,
	parseLeadReview,
	parseLeadScores,
	projectLead,
} from "@crm/validation";
import type { ConfigService } from "@nestjs/config";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { IntakeService } from "../src/intake/intake.service";
import { leadOsDossierSchema } from "../src/intake/lead-os-dossier";
import { LeadReviewService } from "../src/intake/lead-review.service";
import { LeadFinanceService } from "../src/lead-finance/lead-finance.service";
import { LeadImpactService } from "../src/lead-impact/lead-impact.service";

const suffix = process.env.TEST_RUN_ID ?? "lead-lifecycle-e2e";
const sourceId = `lifecycle-${suffix}`;
const domain = `lifecycle-${suffix}.invalid`;
const userId = `user-${suffix}`;
const reason =
	"La evidencia pública es sólida y el problema es concreto, así que vale una primera conversación.";

const config = {
	get: () => "http://lead-os.invalid/webhook",
} as unknown as ConfigService;

const intake = new IntakeService(db);
const review = new LeadReviewService(db, config, new ActivityStampService(db));
const impact = new LeadImpactService(db);
const finance = new LeadFinanceService(db);

const realFetch = globalThis.fetch;
const savedDemoFlag = process.env.HACKATHON_DEMO_MODE;
let forwarded: unknown[] = [];

/** The dossier Eve writes after researching a lead. Parsed, so it cannot drift. */
const dossier = leadOsDossierSchema.parse({
	version: "lead-os-eve-v1",
	generated_at: new Date().toISOString(),
	classification: {
		status: "REVIEW_REQUIRED",
		scenario: "Presencia social activa sin sitio propio.",
		possible_competitor: false,
	},
	scores: {
		evidence_quality: 82,
		commercial_opportunity: 74,
		contact_priority: 88,
		contact_readiness: 70,
	},
	digital_presence: {
		owned_website: false,
		website_accessible: false,
		instagram: true,
		tiktok: false,
		facebook: false,
		pagespeed_mobile: null,
		forms: 0,
		booking_links: 0,
		whatsapp_links: 1,
	},
	commercial_assessment: {
		problem: "Reciben pedidos por redes sin un sistema que los centralice.",
		recommended_offer: "WEB_SOCIAL_CONVERSION",
		why_this_offer:
			"Hay señales activas de venta por redes y no hay sitio propio.",
		implementation_plan: ["Levantar catálogo con precios"],
		price_guidance: "Rango inicial: 2.5M - 4M COP, a confirmar.",
		recommended_channel: "WhatsApp",
	},
	evidence: [
		{
			claim: "Cuenta de Instagram activa con catálogo",
			source: `https://evidencia.invalid/${suffix}`,
			strength: 85,
		},
	],
	missing_evidence: ["Confirmar volumen mensual real de pedidos"],
	guardrails: ["Datos sintéticos: no contactar"],
});

async function clean() {
	const companies = await db.company.findMany({
		where: { domain },
		select: { id: true },
	});
	const ids = companies.map((row) => row.id);
	await db.activity.deleteMany({ where: { companyId: { in: ids } } });
	await db.contact.deleteMany({ where: { companyId: { in: ids } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

async function descriptionOf(companyId: string) {
	const company = await db.company.findUniqueOrThrow({
		where: { id: companyId },
		select: { description: true },
	});
	return company.description;
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Revisor E2E", email: `${userId}@example.test` },
	});
});

beforeEach(() => {
	forwarded = [];
	delete process.env.HACKATHON_DEMO_MODE;
	globalThis.fetch = (async (_url: string, init?: RequestInit) => {
		forwarded.push(JSON.parse(String(init?.body)));
		return new Response("{}", { status: 200 });
	}) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	if (savedDemoFlag === undefined) delete process.env.HACKATHON_DEMO_MODE;
	else process.env.HACKATHON_DEMO_MODE = savedDemoFlag;
});

afterAll(clean);

describe("a lead from intake to an authorized contact", () => {
	it("walks the whole path and never unlocks contact before a person decides", async () => {
		// 1. Lead OS sends a public lead with the dossier Eve wrote.
		const imported = await intake.import([
			{
				sourceId,
				companyName: `Lifecycle Demo ${suffix}`,
				websiteUrl: `https://${domain}`,
				city: "Bogotá",
				niche: "Panadería",
				whatsappUrl: `https://whatsapp.invalid/${suffix}`,
				instagramUrl: `https://instagram.invalid/${suffix}`,
				contactName: "Camila Demo",
				contactRole: "Encargada de redes",
				score: dossier.scores.commercial_opportunity,
				recommendedOffer: dossier.commercial_assessment.recommended_offer,
				pipelineStage: "REVIEW_REQUIRED",
				reviewStatus: "PENDING",
				doNotContact: true,
				painHypothesis: dossier.commercial_assessment.problem,
				sourceUrl: dossier.evidence[0]?.source,
				dossier,
			},
		]);
		const companyId = imported.imported[0]?.companyId;
		expect(companyId).toBeString();
		if (!companyId) throw new Error("intake returned no company");

		// 2. The lead arrives locked: pending review and do-not-contact.
		const onArrival = parseLeadReview(await descriptionOf(companyId));
		expect(onArrival).toMatchObject({
			isLead: true,
			stage: "REVIEW_REQUIRED",
			status: "PENDING",
			doNotContact: true,
			contactAllowed: false,
		});

		// 3. The dossier's scores are what every later number is built from.
		const scores = parseLeadScores(await descriptionOf(companyId));
		expect(scores).toEqual({ evidence: 82, opportunity: 74, priority: 88 });
		if (!scores) throw new Error("the dossier lost its scores");

		const projection = projectLead(scores, defaultAssumptions("COP"));
		expect(projection.closeProbability).toBeCloseTo(0.796, 10);
		expect(projection.expectedValue).toBeCloseTo(2_363_000, 4);

		const financed = await finance.portfolio();
		expect(financed.leads.some((lead) => lead.id === companyId)).toBe(true);

		// 4. A decision without a real reason changes nothing.
		await expect(
			review.decide(companyId, "APPROVED", "Revisor E2E", userId, "corto"),
		).rejects.toThrow();
		expect(forwarded).toHaveLength(0);
		expect(parseLeadReview(await descriptionOf(companyId)).contactAllowed).toBe(
			false,
		);
		expect(await db.activity.count({ where: { companyId } })).toBe(0);

		// 5. A person approves it with a reason. Lead OS hears about it.
		await review.decide(companyId, "APPROVED", "Revisor E2E", userId, reason);
		expect(forwarded).toEqual([
			{ sourceId, decision: "APPROVED", reviewedBy: "Revisor E2E", reason },
		]);

		// 6. Only now is the contact channel allowed, and the history says why.
		const decided = parseLeadReview(await descriptionOf(companyId));
		expect(decided).toMatchObject({
			status: "APPROVED",
			doNotContact: false,
			reviewedBy: "Revisor E2E",
			reason,
			contactAllowed: true,
		});

		const notes = await db.activity.findMany({ where: { companyId } });
		expect(notes).toHaveLength(1);
		expect(notes[0]).toMatchObject({
			type: ActivityType.NOTE,
			subject: "Lead review: approved by Revisor E2E",
			body: reason,
			createdById: userId,
		});

		const company = await db.company.findUniqueOrThrow({
			where: { id: companyId },
			select: { lastActivityAt: true },
		});
		expect(company.lastActivityAt).not.toBeNull();

		// 7. The impact page counts this lead as reviewed and allowed.
		const measured = await impact.summary();
		const row = measured.companies.find((entry) => entry.id === companyId);
		expect(row).toMatchObject({ status: "APPROVED", contactAllowed: true });
		expect(measured.totals.reviewed).toBeGreaterThan(0);
		expect(measured.risk.contactsAllowed + measured.risk.contactsBlocked).toBe(
			measured.totals.leads,
		);
	});

	it("keeps a rejected lead locked, and a later intake never reopens it", async () => {
		await clean();
		await db.user.create({
			data: {
				id: userId,
				name: "Revisor E2E",
				email: `${userId}@example.test`,
			},
		});

		const imported = await intake.import([
			{
				sourceId,
				companyName: `Lifecycle Demo ${suffix}`,
				websiteUrl: `https://${domain}`,
				pipelineStage: "REVIEW_REQUIRED",
				reviewStatus: "PENDING",
				doNotContact: true,
				dossier,
			},
		]);
		const companyId = imported.imported[0]?.companyId;
		if (!companyId) throw new Error("intake returned no company");

		await review.decide(companyId, "REJECTED", "Revisor E2E", userId, reason);

		const rejected = parseLeadReview(await descriptionOf(companyId));
		expect(rejected).toMatchObject({
			status: "REJECTED",
			doNotContact: true,
			contactAllowed: false,
		});

		// Lead OS sends the same lead again, as its own pipeline would.
		await intake.import([
			{
				sourceId,
				companyName: `Lifecycle Demo ${suffix}`,
				websiteUrl: `https://${domain}`,
				pipelineStage: "REVIEW_REQUIRED",
				reviewStatus: "REJECTED",
				doNotContact: true,
				dossier,
				updateOnly: true,
			},
		]);

		const afterReimport = parseLeadReview(await descriptionOf(companyId));
		expect(afterReimport.contactAllowed).toBe(false);
		expect(afterReimport.doNotContact).toBe(true);
	});

	it("refuses a dossier whose evidence link would run script", async () => {
		for (const source of [
			"javascript:alert(document.cookie)",
			"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
			"file:///etc/passwd",
		]) {
			const result = leadOsDossierSchema.safeParse({
				...dossier,
				evidence: [{ claim: "Un enlace hostil", source, strength: 90 }],
			});
			expect(result.success, source).toBe(false);
		}
	});

	it("records the decision without calling Lead OS in demo mode", async () => {
		await clean();
		await db.user.create({
			data: {
				id: userId,
				name: "Revisor E2E",
				email: `${userId}@example.test`,
			},
		});
		process.env.HACKATHON_DEMO_MODE = "true";

		const imported = await intake.import([
			{
				sourceId,
				companyName: `Lifecycle Demo ${suffix}`,
				websiteUrl: `https://${domain}`,
				pipelineStage: "REVIEW_REQUIRED",
				reviewStatus: "PENDING",
				doNotContact: true,
				dossier,
			},
		]);
		const companyId = imported.imported[0]?.companyId;
		if (!companyId) throw new Error("intake returned no company");

		await review.decide(companyId, "APPROVED", "Revisor E2E", userId, reason);

		expect(forwarded).toHaveLength(0);
		expect(parseLeadReview(await descriptionOf(companyId)).contactAllowed).toBe(
			true,
		);
		expect(await db.activity.count({ where: { companyId } })).toBe(1);
	});
});
