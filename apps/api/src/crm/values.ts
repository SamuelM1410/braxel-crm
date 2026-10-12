import type { Prisma } from "@crm/db";
import { Prisma as PrismaNamespace } from "@crm/db";

export function toCents(amount: Prisma.Decimal | null): number | null {
	return amount === null ? null : amount.times(100).toNumber();
}

export function fromCents(cents: number | null | undefined): number | null {
	return cents === null || cents === undefined ? null : cents / 100;
}

export function decimalFromCents(
	cents: number | null | undefined,
): Prisma.Decimal | null {
	return cents === null || cents === undefined
		? null
		: new PrismaNamespace.Decimal(cents).dividedBy(100);
}

export function blankToNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

export function normalizeEmail(value: string): string | null {
	return blankToNull(value)?.toLowerCase() ?? null;
}

export type PhoneValidation = {
	valid: boolean;
	normalized: string | null;
	reason:
		| "EMPTY"
		| "INVALID_LENGTH_OR_PREFIX"
		| "REPEATED_DIGITS"
		| "SEQUENTIAL_DIGITS"
		| "VALID";
};

/**
 * Validate a Colombian phone without claiming that the number is registered
 * on WhatsApp. That second check requires a permitted WhatsApp provider/API.
 */
export function validatePhone(
	value: string | null | undefined,
): PhoneValidation {
	const trimmed = value?.trim();
	if (!trimmed) return { valid: false, normalized: null, reason: "EMPTY" };

	const digits = trimmed.replace(/\D/g, "");
	if (!digits || /^(\d)\1{3,}$/.test(digits)) {
		return { valid: false, normalized: null, reason: "REPEATED_DIGITS" };
	}
	if (hasSequentialRun(digits)) {
		return { valid: false, normalized: null, reason: "SEQUENTIAL_DIGITS" };
	}

	if (digits.length === 9 && digits.startsWith("3")) {
		return {
			valid: false,
			normalized: null,
			reason: "INVALID_LENGTH_OR_PREFIX",
		};
	}
	if (digits.length === 12 && digits.startsWith("57")) {
		const national = digits.slice(2);
		if (/^(?:3|6)\d{9}$/.test(national)) {
			return { valid: true, normalized: `+${digits}`, reason: "VALID" };
		}
	}
	if (digits.length === 10 && /^(?:3|6)\d{9}$/.test(digits)) {
		return { valid: true, normalized: `+57${digits}`, reason: "VALID" };
	}
	return { valid: false, normalized: null, reason: "INVALID_LENGTH_OR_PREFIX" };
}

/**
 * Keep only plausible Colombian contact numbers. This is intentionally a
 * validation gate, not a WhatsApp verifier: a valid phone may still be a
 * landline or may not have WhatsApp enabled.
 */
export function normalizePhone(
	value: string | null | undefined,
): string | null {
	return validatePhone(value).normalized;
}

function hasSequentialRun(digits: string): boolean {
	for (let index = 0; index <= digits.length - 7; index += 1) {
		const slice = digits.slice(index, index + 7);
		let ascending = true;
		let descending = true;
		for (let cursor = 1; cursor < slice.length; cursor += 1) {
			const delta = Number(slice[cursor]) - Number(slice[cursor - 1]);
			ascending &&= delta === 1;
			descending &&= delta === -1;
		}
		if (ascending || descending) return true;
	}
	return false;
}

export function normalizeWhatsAppUrl(
	value: string | null | undefined,
): string | null {
	if (!value?.trim()) return null;
	try {
		const url = new URL(value.trim());
		const host = url.hostname.toLowerCase();
		if (host !== "wa.me" && !host.endsWith(".whatsapp.com")) return null;
		const phone =
			host === "wa.me"
				? url.pathname.replace(/\//g, "")
				: url.searchParams.get("phone");
		return normalizePhone(phone) ? url.toString() : null;
	} catch {
		return null;
	}
}
