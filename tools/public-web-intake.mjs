#!/usr/bin/env node

// Local, provider-free enrichment for businesses already discovered from Maps
// or another permitted source. It reads only public pages on the company's
// own website, records provenance, and never sends outreach automatically.
import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import { URL } from "node:url";

const args = process.argv.slice(2);
const valueOf = (name, fallback = null) =>
	args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ??
	fallback;
const inputPath = valueOf("input");
const maxPages = Math.min(Math.max(Number(valueOf("max-pages", "8")), 1), 12);
const maxLeads = Math.min(Math.max(Number(valueOf("max", "50")), 1), 100);
const commit = args.includes("--commit");

if (!inputPath) {
	throw new Error(
		"Uso: node scripts/public-web-intake.mjs --input=maps.json [--max=50] [--commit]",
	);
}

async function loadEnv(path = ".env") {
	try {
		const text = await fs.readFile(path, "utf8");
		for (const line of text.split(/\r?\n/)) {
			const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
			if (match && !process.env[match[1]]) {
				process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
			}
		}
	} catch {
		// An environment file is optional; production secrets must be injected.
	}
}
await loadEnv();

function publicUrl(raw) {
	if (typeof raw !== "string" || !raw.trim()) return null;
	const url = new URL(raw.trim());
	if (!['http:', 'https:'].includes(url.protocol)) return null;
	if (url.username || url.password) return null;
	const host = url.hostname.toLowerCase();
	if (
		host === "localhost" ||
		host.endsWith(".localhost") ||
		host === "metadata.google.internal" ||
		net.isIP(host) && (host === "127.0.0.1" || host === "::1" || host.startsWith("10.") || host.startsWith("192.168."))
	) return null;
	return url;
}

async function resolvesPublicHost(url) {
	if (net.isIP(url.hostname)) return !publicUrl(`http://${url.hostname}`) ? false : true;
	try {
		const addresses = await dns.lookup(url.hostname, { all: true });
		return addresses.length > 0 && addresses.every(({ address }) => {
			if (net.isIPv4(address)) {
				return !(
					address.startsWith("10.") ||
					address.startsWith("192.168.") ||
					address.startsWith("127.") ||
					address.startsWith("169.254.") ||
					address.startsWith("172.16.") ||
					address.startsWith("172.17.") ||
					address.startsWith("172.18.") ||
					address.startsWith("172.19.") ||
					address.startsWith("172.2") ||
					address.startsWith("172.3")
				);
			}
			return address !== "::1" && !address.toLowerCase().startsWith("fc");
		});
	} catch {
		return false;
	}
}

function csvRows(text) {
	const lines = text.split(/\r?\n/).filter(Boolean);
	if (!lines.length) return [];
	const cells = (line) => line.split(",").map((cell) => cell.trim().replace(/^['"]|['"]$/g, ""));
	const headers = cells(lines[0]);
	return lines.slice(1).map((line) => Object.fromEntries(cells(line).map((value, index) => [headers[index], value])));
}

async function readSeeds(path) {
	const raw = await fs.readFile(path, "utf8");
	if (path.endsWith(".csv")) return csvRows(raw);
	const json = JSON.parse(raw);
	return Array.isArray(json) ? json : Array.isArray(json.leads) ? json.leads : [];
}

function textFromHtml(html) {
	return html
		.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&(?:amp|lt|gt|quot|#39);/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function linksFromHtml(html, pageUrl) {
	const links = [];
	for (const match of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
		try { links.push(new URL(match[1], pageUrl).href); } catch {}
	}
	return links;
}

function normalisePhone(value) {
	const clean = value.replace(/[^+\d]/g, "");
	return clean.replace(/^00/, "+");
}

function stableSourceId(seed, website) {
	return `public-web:${crypto.createHash("sha256").update(`${seed.companyName ?? seed.name ?? ""}|${website}`).digest("hex").slice(0, 24)}`;
}

function isLikelyContactPage(url) {
	return /contact|contacto|about|nosotros|servicios|services|footer|impressum|contato/i.test(url);
}

async function robotsAllow(origin, path) {
	try {
		const response = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "BraxelResearchBot/1.0" } });
		if (!response.ok) return true;
		let applies = false;
		for (const line of (await response.text()).split(/\r?\n/)) {
			const [key, value = ""] = line.split(":", 2).map((part) => part.trim());
			if (/^user-agent$/i.test(key)) applies = value === "*";
			if (applies && /^disallow$/i.test(key) && value && path.startsWith(value)) return false;
		}
		return true;
	} catch {
		return true;
	}
}

async function enrich(seed) {
	const website = publicUrl(seed.websiteUrl ?? seed.website ?? seed.url);
	if (!website || !(await resolvesPublicHost(website))) return null;
	const origin = website.origin;
	const queue = [website.href];
	const visited = new Set();
	const channels = new Map();
	const evidence = [];
	while (queue.length && visited.size < maxPages) {
		const page = queue.shift();
		if (visited.has(page)) continue;
		const parsed = publicUrl(page);
		if (!parsed || parsed.origin !== origin || !(await robotsAllow(origin, parsed.pathname))) continue;
		visited.add(parsed.href);
		let response;
		try {
			response = await fetch(parsed.href, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "user-agent": "BraxelResearchBot/1.0" } });
		} catch { continue; }
		if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) continue;
		const html = await response.text();
		const text = textFromHtml(html);
		const add = (type, value, confidence = 70) => {
			const clean = String(value).trim().replace(/[),.;]+$/, "");
			if (!clean || channels.has(`${type}:${clean}`)) return;
			channels.set(`${type}:${clean}`, { type, value: clean, source_url: parsed.href, observed_at: new Date().toISOString(), confidence, verified: false });
		};
		for (const email of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) add("email", email, 80);
		for (const phone of text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? []) {
			const normalised = normalisePhone(phone);
			if (normalised.length >= 8) add("phone", normalised, 65);
		}
		for (const link of linksFromHtml(html, parsed.href)) {
			const lower = link.toLowerCase();
			if (lower.startsWith("mailto:")) add("email", link.slice(7).split("?")[0], 85);
			if (lower.startsWith("tel:")) add("phone", normalisePhone(link.slice(4)), 85);
			if (lower.includes("wa.me/") || lower.includes("api.whatsapp.com/") || lower.includes("whatsapp")) add("whatsapp", link, 80);
			for (const network of ["instagram", "facebook", "tiktok", "linkedin"]) if (lower.includes(`${network}.com`)) add(network, link, 75);
			try {
				if (new URL(link).origin === origin && isLikelyContactPage(link) && !visited.has(link) && queue.length < maxPages * 2) queue.push(link);
			} catch {}
		}
		evidence.push({ source_url: parsed.href, observed_at: new Date().toISOString(), confidence: 70, claims: { has_contact_text: /contact|contacto|whatsapp|tel[eé]fono|correo|email/i.test(text) } });
	}
	if (!channels.size) return null;
	return {
		sourceId: stableSourceId(seed, website.origin),
		companyName: seed.companyName ?? seed.company_name ?? seed.name ?? null,
		websiteUrl: website.href,
		city: seed.city ?? seed.location ?? null,
		contactChannels: [...channels.values()],
		sourceUrl: seed.sourceUrl ?? seed.source_url ?? website.href,
		evidence,
		pipelineStage: "REVIEW_REQUIRED",
		reviewStatus: "PENDING",
		doNotContact: true,
		reviewReason: "Canales públicos encontrados en el sitio oficial; requieren verificación y aprobación humana.",
	};
}

const seeds = (await readSeeds(inputPath)).slice(0, maxLeads);
const leads = [];
for (const seed of seeds) {
	const result = await enrich(seed);
	if (result) leads.push(result);
}

const payload = { provider: "public-web", candidates: leads.length, skipped: seeds.length - leads.length, dryRun: !commit, leads };
console.log(JSON.stringify(payload, null, 2));

if (commit) {
	const intakeUrl = process.env.CRM_INTAKE_URL;
	const secret = process.env.CRM_INTAKE_SECRET;
	if (!intakeUrl || !secret) throw new Error("Para --commit faltan CRM_INTAKE_URL y CRM_INTAKE_SECRET.");
	const response = await fetch(intakeUrl, {
		method: "POST",
		headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
		body: JSON.stringify({ leads }),
	});
	if (!response.ok) throw new Error(`CRM respondió HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
	console.error("Importación completada:", await response.text());
}
