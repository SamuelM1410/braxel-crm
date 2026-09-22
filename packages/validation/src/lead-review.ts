import { z } from "zod";

export const LEAD_REVIEW = {
	reason: { minLength: 10, maxLength: 1000 },
} as const;

export const reason = z
	.string()
	.trim()
	.min(
		LEAD_REVIEW.reason.minLength,
		`Explain the decision in at least ${LEAD_REVIEW.reason.minLength} characters.`,
	)
	.max(LEAD_REVIEW.reason.maxLength);
