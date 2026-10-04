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

/**
 * Keep only plausible Colombian contact numbers. This is intentionally a
 * validation gate, not a WhatsApp verifier: a valid phone may still be a
 * landline or may not have WhatsApp enabled.
 */
export function normalizePhone(
	value: string | null | undefined,
): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const digits = trimmed.replace(/\D/g, "");
	if (!digits || /^([0-9])\1+$/.test(digits)) return null;
	if (/^(?:0123456789|1234567890|0987654321|9876543210)/.test(digits))
		return null;
	if (digits.length === 9 && digits.startsWith("3")) return null;
	if (digits.length === 12 && digits.startsWith("57")) {
		const national = digits.slice(2);
		return /^(?:3|6)\d{9}$/.test(national) ? `+${digits}` : null;
	}
	if (digits.length === 10 && /^(?:3|6)\d{9}$/.test(digits))
		return `+57${digits}`;
	return null;
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
