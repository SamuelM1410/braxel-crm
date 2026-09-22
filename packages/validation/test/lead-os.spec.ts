import { describe, expect, it } from "bun:test";
import {
	LEAD_REVIEW,
	parseLeadReview,
	parseLeadScores,
	schemas,
} from "../src/index";

const dossier = JSON.stringify({
	scores: {
		evidence_quality: 82,
		commercial_opportunity: 74,
		contact_priority: 88,
	},
});

const pending = [
	"Lead OS source: demo-1",
	"Datos sintéticos: sí",
	"Etapa Lead OS: REVIEW_REQUIRED",
	"Revisión: PENDING",
	"No contactar: sí",
	"Motivo de revisión: Requiere decisión humana.",
	`Dossier Lead OS: ${dossier}`,
].join("\n");

const approved = pending
	.replace("Revisión: PENDING", "Revisión: APPROVED")
	.replace("No contactar: sí", "No contactar: no")
	.replace(
		"Motivo de revisión: Requiere decisión humana.",
		"Revisado por: Ana\nMotivo de revisión: Evidencia sólida y problema concreto.",
	);

describe("parseLeadReview", () => {
	it("reads a pending synthetic lead as locked", () => {
		expect(parseLeadReview(pending)).toEqual({
			isLead: true,
			stage: "REVIEW_REQUIRED",
			status: "PENDING",
			doNotContact: true,
			reviewedBy: null,
			reason: null,
			synthetic: true,
			contactAllowed: false,
		});
	});

	it("allows contact only after an approval that lifts do-not-contact", () => {
		const review = parseLeadReview(approved);
		expect(review.status).toBe("APPROVED");
		expect(review.reviewedBy).toBe("Ana");
		expect(review.reason).toBe("Evidencia sólida y problema concreto.");
		expect(review.contactAllowed).toBe(true);
	});

	it("keeps a rejected lead locked", () => {
		const rejected = approved
			.replace("APPROVED", "REJECTED")
			.replace("No contactar: no", "No contactar: sí");
		expect(parseLeadReview(rejected).contactAllowed).toBe(false);
	});

	it("keeps an approved lead locked while do-not-contact is still set", () => {
		const stuck = approved.replace("No contactar: no", "No contactar: sí");
		expect(parseLeadReview(stuck).contactAllowed).toBe(false);
	});

	it("treats a missing or unknown review line as unreviewed", () => {
		const missing = pending.replace("Revisión: PENDING\n", "");
		const unknown = pending.replace("PENDING", "MAYBE");
		expect(parseLeadReview(missing).status).toBeNull();
		expect(parseLeadReview(unknown).status).toBeNull();
		expect(parseLeadReview(missing).contactAllowed).toBe(false);
	});

	it("does not treat other companies as leads", () => {
		expect(parseLeadReview("Just a note").isLead).toBe(false);
		expect(parseLeadReview(null).contactAllowed).toBe(false);
	});
});

describe("parseLeadScores", () => {
	it("reads the three scores from the dossier line", () => {
		expect(parseLeadScores(pending)).toEqual({
			evidence: 82,
			opportunity: 74,
			priority: 88,
		});
	});

	it("returns null for a missing, broken or out-of-range dossier", () => {
		expect(parseLeadScores("Lead OS source: demo-1")).toBeNull();
		expect(parseLeadScores("Dossier Lead OS: {oops")).toBeNull();
		expect(
			parseLeadScores(
				`Dossier Lead OS: ${JSON.stringify({ scores: { evidence_quality: 130, commercial_opportunity: 1, contact_priority: 1 } })}`,
			),
		).toBeNull();
	});
});

describe("review reason", () => {
	it("refuses an empty or too short reason", () => {
		expect(schemas.leadReview.reason.safeParse(undefined).success).toBe(false);
		expect(schemas.leadReview.reason.safeParse("   ").success).toBe(false);
		expect(schemas.leadReview.reason.safeParse("ok").success).toBe(false);
	});

	it("accepts a reason at the minimum length and trims it", () => {
		const text = `  ${"a".repeat(LEAD_REVIEW.reason.minLength)}  `;
		expect(schemas.leadReview.reason.parse(text)).toBe(
			"a".repeat(LEAD_REVIEW.reason.minLength),
		);
	});

	it("refuses a reason over the maximum length", () => {
		const text = "a".repeat(LEAD_REVIEW.reason.maxLength + 1);
		expect(schemas.leadReview.reason.safeParse(text).success).toBe(false);
	});
});
