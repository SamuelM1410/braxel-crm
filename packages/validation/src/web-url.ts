import { z } from "zod";

/**
 * Only a link a browser may follow safely. `z.string().url()` is not that check:
 * the URL constructor accepts `javascript:`, `data:`, `vbscript:` and `file:`, so
 * a string that reached us from a web page Eve read, or from the intake endpoint,
 * can become a one-click script in a rep's session.
 */
export const WEB_URL_SCHEMES = ["http:", "https:"] as const;

export const MAX_URL_LENGTH = 2048;

export function isWebUrl(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > MAX_URL_LENGTH) return false;
	try {
		const parsed = new URL(trimmed);
		return (WEB_URL_SCHEMES as readonly string[]).includes(parsed.protocol);
	} catch {
		return false;
	}
}

/** The href to render, or null when the value is not a safe web link. */
export function safeHref(value: string | null | undefined): string | null {
	return isWebUrl(value) ? value.trim() : null;
}

export const webUrl = z
	.string()
	.trim()
	.max(MAX_URL_LENGTH)
	.refine(isWebUrl, "Use a http or https link.");
