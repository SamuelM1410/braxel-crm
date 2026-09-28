import { createHmac, timingSafeEqual } from "node:crypto";

function baseUrl() {
	return (
		process.env.EMAIL_UNSUBSCRIBE_BASE_URL?.trim() ||
		process.env.API_URL?.trim() ||
		process.env.APP_URL?.split(",")[0]?.trim() ||
		"http://localhost:3001"
	).replace(/\/$/, "");
}

function secret() {
	return (
		process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() ||
		process.env.BETTER_AUTH_SECRET?.trim() ||
		null
	);
}

function normaliseEmail(email: string) {
	return email.trim().toLowerCase();
}

function sign(payload: string) {
	const key = secret();
	if (!key) return null;
	return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createUnsubscribeToken(email: string) {
	const payload = Buffer.from(normaliseEmail(email), "utf8").toString(
		"base64url",
	);
	const signature = sign(payload);
	return signature ? `${payload}.${signature}` : null;
}

export function verifyUnsubscribeToken(token: string) {
	const [payload, signature] = token.split(".");
	if (!payload || !signature) return null;
	const expected = sign(payload);
	if (!expected) return null;
	const actualBuffer = Buffer.from(signature);
	const expectedBuffer = Buffer.from(expected);
	if (
		actualBuffer.length !== expectedBuffer.length ||
		!timingSafeEqual(actualBuffer, expectedBuffer)
	)
		return null;
	try {
		const email = Buffer.from(payload, "base64url").toString("utf8");
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
			? normaliseEmail(email)
			: null;
	} catch {
		return null;
	}
}

export function unsubscribeUrl(email: string) {
	const token = createUnsubscribeToken(email);
	if (!token) return null;
	const url = new URL("/api/email/unsubscribe", baseUrl());
	url.searchParams.set("token", token);
	return url.toString();
}

export function marketingHeaders(email: string) {
	const url = unsubscribeUrl(email);
	if (!url) return [];
	return [
		`List-Unsubscribe: <${url}>`,
		"List-Unsubscribe-Post: List-Unsubscribe=One-Click",
	];
}

export function marketingBody(body: string, email: string) {
	const url = unsubscribeUrl(email);
	if (!url) return body.trim();
	return `${body.trim()}\n\n—\nSi no deseas recibir más mensajes, puedes darte de baja aquí: ${url}`;
}
