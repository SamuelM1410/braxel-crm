import "dotenv/config";
import express from "express";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;
const port = Number(process.env.PORT || 8787);
const inboundOnly = process.env.WHATSAPP_INBOUND_ONLY !== "false";
const autoReplyEnabled = process.env.AUTO_REPLY_ENABLED === "true";
const crmReplyUrl = process.env.CRM_REPLY_URL?.trim() || "";
const crmReplySecret = process.env.CRM_REPLY_SECRET?.trim() || "";
const crmTimeoutMs = Number(process.env.CRM_REPLY_TIMEOUT_MS || 12000);
const openAiApiKey = process.env.OPENAI_API_KEY?.trim() || "";
const audioTimeoutMs = Number(process.env.WHATSAPP_AUDIO_TIMEOUT_MS || 20000);

const app = express();
app.use(express.json({ limit: "256kb" }));

const client = new Client({
	authStrategy: new LocalAuth({
		clientId: process.env.WHATSAPP_CLIENT_ID || "braxel-test",
		dataPath: ".wwebjs_auth",
	}),
	puppeteer: {
		headless: true,
		executablePath:
			process.env.PUPPETEER_EXECUTABLE_PATH ||
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	},
});

let state = "starting";
let lastQrAt = null;
let lastMessageAt = null;
let lastMessageId = null;
let lastCrmAt = null;
let lastCrmError = null;
let lastCrmResult = null;
let lastDraftAt = null;

function accountSummary() {
	const info = client.info;
	const wid = info?.wid;
	return {
		id: wid?._serialized || null,
		phone: wid?.user || null,
		name: info?.pushname || null,
	};
}

function withTimeout(promise, timeoutMs) {
	return Promise.race([
		promise,
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error("CRM reply timeout")), timeoutMs),
		),
	]);
}

async function transcribeAudio(message) {
	if (!openAiApiKey)
		throw new Error("OPENAI_API_KEY is required for audio messages");
	const media = await withTimeout(message.downloadMedia(), audioTimeoutMs);
	if (!media?.data) throw new Error("WhatsApp audio media was empty");
	const audio = Buffer.from(media.data, "base64");
	const form = new FormData();
	form.append(
		"file",
		new Blob([audio], { type: media.mimetype || "audio/ogg" }),
		"whatsapp-audio.ogg",
	);
	form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
	form.append("language", "es");
	const response = await withTimeout(
		fetch("https://api.openai.com/v1/audio/transcriptions", {
			method: "POST",
			headers: { Authorization: `Bearer ${openAiApiKey}` },
			body: form,
		}),
		audioTimeoutMs,
	);
	if (!response.ok)
		throw new Error(`Audio transcription HTTP ${response.status}`);
	const body = await response.json();
	const text = body.text?.trim();
	if (!text) throw new Error("Audio transcription returned no text");
	return text;
}

async function askCrm(event) {
	if (!crmReplyUrl) return null;
	if (!crmReplySecret)
		throw new Error(
			"CRM_REPLY_SECRET is required when CRM_REPLY_URL is configured",
		);
	const response = await withTimeout(
		fetch(crmReplyUrl, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${crmReplySecret}`,
			},
			body: JSON.stringify(event),
		}),
		crmTimeoutMs,
	);
	if (!response.ok) throw new Error(`CRM reply HTTP ${response.status}`);
	const body = await response.json();
	return {
		reply:
			typeof body.reply === "string" && body.reply.trim()
				? body.reply.trim()
				: null,
		draft:
			typeof body.draft === "string" && body.draft.trim()
				? body.draft.trim()
				: null,
		approvalRequired: body.approvalRequired !== false,
		reviewReason:
			typeof body.reviewReason === "string" ? body.reviewReason : null,
	};
}

app.get("/health", (_req, res) => {
	res.json({
		ok: state === "ready",
		state,
		inboundOnly,
		autoReplyEnabled,
		crmConfigured: Boolean(crmReplyUrl),
		crmAuthConfigured: Boolean(crmReplyUrl && crmReplySecret),
		lastQrAt,
		lastMessageAt,
		lastMessageId,
		lastCrmAt,
		lastCrmError,
		lastCrmResult,
		lastDraftAt,
		account: accountSummary(),
	});
});

client.on("qr", async (qr) => {
	state = "awaiting_qr";
	lastQrAt = new Date().toISOString();
	await QRCode.toFile("/tmp/braxel-whatsapp-qr.png", qr, {
		width: 720,
		margin: 4,
	});
	console.log("\nEscanea este QR con el número de prueba de Braxel:\n");
	qrcode.generate(qr, { small: true });
	console.log(
		"\nTambién se guardó una imagen en /tmp/braxel-whatsapp-qr.png.\n",
	);
});

client.on("authenticated", () => {
	state = "authenticated";
	console.log("WhatsApp Web autenticado.");
});
client.on("ready", () => {
	state = "ready";
	console.log("WhatsApp Web listo. Modo inbound-only:", inboundOnly);
});
client.on("auth_failure", (message) => {
	state = "auth_failure";
	console.error("Falló la autenticación de WhatsApp Web:", message);
});
client.on("disconnected", (reason) => {
	state = "disconnected";
	console.warn("WhatsApp Web desconectado:", reason);
});

client.on("message", async (message) => {
	if (
		message.fromMe ||
		message.from.endsWith("@g.us") ||
		message.from === "status@broadcast"
	)
		return;
	lastMessageAt = new Date().toISOString();
	const externalMessageId =
		message.id?._serialized ||
		message.id?.id ||
		`${message.from}:${message.timestamp || Date.now()}:${message.body || ""}`;
	lastMessageId = externalMessageId;
	const contact = await message.getContact();
	const isAudio = message.type === "ptt" || message.type === "audio";
	let text = message.body || "";
	if (isAudio && !text.trim()) {
		try {
			text = await transcribeAudio(message);
			console.log("Audio transcrito para Eve:", text);
		} catch (error) {
			lastCrmError =
				error instanceof Error ? error.message : "audio transcription failed";
			lastCrmResult = "audio_error";
			console.error("No se pudo transcribir el audio:", lastCrmError);
			if (!inboundOnly && autoReplyEnabled) {
				try {
					await message.reply(
						"No pude escuchar el audio correctamente. ¿Puedes enviarme el mensaje por texto?",
					);
				} catch (replyError) {
					console.error("No se pudo enviar el aviso de audio:", replyError);
				}
			}
			return;
		}
	}
	const event = {
		channel: "WHATSAPP_WEB_PILOT",
		externalMessageId,
		externalSenderId: message.from,
		phone: contact.number || null,
		name: contact.pushname || contact.name || null,
		text,
		receivedAt: lastMessageAt,
	};
	console.log("Mensaje entrante:", JSON.stringify(event));
	let reply = null;
	try {
		const crmResult = await askCrm(event);
		lastCrmAt = new Date().toISOString();
		lastCrmError = null;
		lastCrmResult = crmResult?.draft ? "draft" : "no_draft";
		if (crmResult?.draft) lastDraftAt = lastCrmAt;
		reply = crmResult?.reply || null;
		if (crmResult?.draft) console.log("Borrador de Eve:", crmResult.draft);
		if (crmResult?.approvalRequired && crmResult?.reviewReason)
			console.log("Revisión humana requerida:", crmResult.reviewReason);
	} catch (error) {
		lastCrmError = error instanceof Error ? error.message : "unknown CRM error";
		lastCrmResult = "error";
		console.error("No se pudo consultar el CRM:", error.message);
	}
	if (!reply || inboundOnly || !autoReplyEnabled) return;
	await message.reply(reply);
	console.log("Respuesta enviada al remitente del mensaje entrante.");
});

app.listen(port, () => {
	console.log(`Health check: http://localhost:${port}/health`);
	console.log(
		"CRM bridge configured:",
		Boolean(crmReplyUrl),
		Boolean(crmReplySecret),
	);
	console.log("Iniciando cliente de WhatsApp Web...");
	client.initialize();
});
