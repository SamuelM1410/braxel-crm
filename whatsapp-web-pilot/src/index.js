import "dotenv/config";
import {
	createDecipheriv,
	createHmac,
	hkdfSync,
	timingSafeEqual,
} from "node:crypto";
import express from "express";
import QRCode from "qrcode";
import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;
const port = Number(process.env.PORT || 8787);
const inboundOnly = process.env.WHATSAPP_INBOUND_ONLY !== "false";
const autoReplyEnabled = process.env.AUTO_REPLY_ENABLED === "true";
const crmReplyUrl = process.env.CRM_REPLY_URL?.trim() || "";
const crmOutboundUrl =
	process.env.CRM_OUTBOUND_URL?.trim() ||
	(crmReplyUrl ? crmReplyUrl.replace(/\/inbound\/?$/, "/outbound") : "");
const crmReplySecret = process.env.CRM_REPLY_SECRET?.trim() || "";
const crmTimeoutMs = Number(process.env.CRM_REPLY_TIMEOUT_MS || 12000);
const openAiApiKey = process.env.OPENAI_API_KEY?.trim() || "";
const audioTimeoutMs = Number(process.env.WHATSAPP_AUDIO_TIMEOUT_MS || 20000);
const reconnectBaseMs = Number(process.env.WHATSAPP_RECONNECT_BASE_MS || 5000);
const reconnectMaxMs = Number(process.env.WHATSAPP_RECONNECT_MAX_MS || 60000);
const audioDownloadAttempts = 5;

const app = express();
app.use(express.json({ limit: "256kb" }));

const client = new Client({
	authStrategy: new LocalAuth({
		clientId: process.env.WHATSAPP_CLIENT_ID || "braxel-test",
		dataPath: ".wwebjs_auth",
	}),
	userAgent: false,
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
let lastOutboundAt = null;
let lastOutboundError = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let reconnectInFlight = false;

function replyDisabledReason() {
	if (inboundOnly) return "WHATSAPP_INBOUND_ONLY=true";
	if (!autoReplyEnabled) return "AUTO_REPLY_ENABLED=false";
	if (!crmReplyUrl) return "CRM_REPLY_URL is not configured";
	if (!crmReplySecret) return "CRM_REPLY_SECRET is not configured";
	return null;
}

function scheduleReconnect(reason) {
	if (reconnectTimer || reconnectInFlight || state === "awaiting_qr") return;
	const delay = Math.min(
		reconnectBaseMs * 2 ** Math.min(reconnectAttempts, 6),
		reconnectMaxMs,
	);
	reconnectAttempts += 1;
	console.warn(`Reinicio de WhatsApp programado en ${delay} ms:`, reason);
	reconnectTimer = setTimeout(async () => {
		reconnectTimer = null;
		reconnectInFlight = true;
		state = "reconnecting";
		let initialized = false;
		try {
			await client.destroy();
		} catch {}
		try {
			await client.initialize();
			initialized = true;
		} catch (error) {
			console.error(
				"No se pudo reiniciar WhatsApp Web:",
				error instanceof Error ? error.message : error,
			);
		} finally {
			reconnectInFlight = false;
		}
		if (!initialized) scheduleReconnect("initialize failed");
	}, delay);
}

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

function serializeMessageId(message) {
	if (message.id?._serialized) return message.id._serialized;
	const remote =
		typeof message.id?.remote === "string"
			? message.id.remote
			: message.id?.remote?._serialized || message.from || "";
	const id = message.id?.id;
	if (!remote || !id) return null;
	return `${message.id?.fromMe ? "true" : "false"}_${remote}_${id}`;
}

function mediaKeyBuffer(value) {
	if (Buffer.isBuffer(value)) return value;
	if (value instanceof Uint8Array) return Buffer.from(value);
	if (typeof value === "string") {
		const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
		return Buffer.from(
			normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
			"base64",
		);
	}
	if (value && typeof value === "object")
		return Buffer.from(Object.values(value));
	return null;
}

async function downloadMediaDirect(messageOrData) {
	const data = messageOrData._data || messageOrData;
	if (
		!data.directPath ||
		!data.mediaKey ||
		!data.filehash ||
		!data.encFilehash
	) {
		return null;
	}
	const mediaKey = mediaKeyBuffer(data.mediaKey);
	if (!mediaKey) throw new Error("WhatsApp media key was invalid");
	const response = await withTimeout(
		fetch(`https://mmg.whatsapp.net${data.directPath}`, {
			headers: {
				Origin: "https://web.whatsapp.com",
				Referer: "https://web.whatsapp.com/",
				"User-Agent": "Mozilla/5.0",
			},
		}),
		audioTimeoutMs,
	);
	if (!response.ok) throw new Error(`WhatsApp media HTTP ${response.status}`);
	const encrypted = Buffer.from(await response.arrayBuffer());
	if (encrypted.length <= 10)
		throw new Error("WhatsApp media payload was empty");
	const ciphertext = encrypted.subarray(0, -10);
	const actualMac = encrypted.subarray(-10);
	const info =
		data.type === "ptt" || data.type === "audio"
			? "WhatsApp Audio Keys"
			: `WhatsApp ${String(data.type || "Audio").replace(/^./, (value) => value.toUpperCase())} Keys`;
	let expandedKey = null;
	for (const salt of [Buffer.alloc(32), Buffer.alloc(0)]) {
		for (const keyInfo of [info, "WhatsApp Audio Keys"]) {
			const candidate = Buffer.from(
				hkdfSync("sha256", mediaKey, salt, Buffer.from(keyInfo), 112),
			);
			const expectedMac = createHmac("sha256", candidate.subarray(48, 80))
				.update(Buffer.concat([candidate.subarray(0, 16), ciphertext]))
				.digest()
				.subarray(0, 10);
			if (timingSafeEqual(actualMac, expectedMac)) {
				expandedKey = candidate;
				break;
			}
		}
		if (expandedKey) break;
	}
	if (!expandedKey) {
		throw new Error(
			`WhatsApp media integrity check failed (key ${mediaKey.length} bytes, payload ${encrypted.length} bytes)`,
		);
	}
	const decipher = createDecipheriv(
		"aes-256-cbc",
		expandedKey.subarray(16, 48),
		expandedKey.subarray(0, 16),
	);
	const audio = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return {
		data: audio.toString("base64"),
		mimetype: data.mimetype || "audio/ogg",
		filename: data.filename || null,
		filesize: audio.length,
	};
}

async function transcribeAudio(message) {
	if (!openAiApiKey)
		throw new Error("OPENAI_API_KEY is required for audio messages");
	const messageId = serializeMessageId(message);
	if (messageId && message.id && !message.id._serialized) {
		message.id._serialized = messageId;
	}
	let media = null;
	let lastError = null;
	for (let attempt = 1; attempt <= audioDownloadAttempts; attempt += 1) {
		try {
			if (attempt > 1) {
				await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
				await message.reload();
			}
			media = await withTimeout(message.downloadMedia(), audioTimeoutMs);
			if (!media?.data) media = await downloadMediaDirect(message);
			if (media?.data) break;
			lastError = new Error("WhatsApp audio media was empty");
		} catch (error) {
			lastError = error;
			try {
				media = await downloadMediaDirect(message);
				if (media?.data) break;
			} catch (directError) {
				lastError = directError;
			}
		}
	}
	if (!media?.data) {
		const detail =
			lastError instanceof Error ? lastError.message : String(lastError);
		let pageDiagnostics = null;
		try {
			pageDiagnostics = await message.client.pupPage.evaluate(
				async (messageId) => {
					const msg =
						window.require("WAWebCollections").Msg.get(messageId) ||
						(
							await window
								.require("WAWebCollections")
								.Msg.getMessagesById([messageId])
						)?.messages?.[0];
					const mediaData = msg?.mediaData;
					return {
						exists: Boolean(msg),
						mediaStage: mediaData?.mediaStage || null,
						mediaKeys: mediaData ? Object.keys(mediaData) : [],
						directPath: Boolean(msg?.directPath || mediaData?.directPath),
						mediaKey: Boolean(msg?.mediaKey || mediaData?.mediaKey),
						fileHash: Boolean(msg?.filehash || mediaData?.filehash),
						encFileHash: Boolean(msg?.encFilehash || mediaData?.encFilehash),
					};
				},
				messageId,
			);
		} catch (error) {
			pageDiagnostics = {
				error: error instanceof Error ? error.message : String(error),
			};
		}
		console.error("Audio media diagnostics:", {
			type: message.type,
			id: messageId,
			rawIdType: typeof message._data?.id,
			rawIdKeys: message._data?.id ? Object.keys(message._data.id) : [],
			rawId: message._data?.id || null,
			hasMedia: message.hasMedia,
			mimetype: message._data?.mimetype || null,
			filename: message._data?.filename || null,
			duration: message._data?.duration || null,
			dataKeys: message._data ? Object.keys(message._data) : [],
			mediaDataKeys: message._data?.mediaData
				? Object.keys(message._data.mediaData)
				: [],
			directPath: message._data?.directPath || null,
			mediaKey: Boolean(message._data?.mediaKey),
			fileHash: Boolean(message._data?.filehash),
			encFileHash: Boolean(message._data?.encFilehash),
			mediaStage: message._data?.mediaData?.mediaStage || null,
			pageDiagnostics,
		});
		throw new Error(`WhatsApp audio download failed: ${detail}`);
	}
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

async function recordCrmOutbound(event) {
	if (!crmOutboundUrl || !crmReplySecret) return null;
	const response = await withTimeout(
		fetch(crmOutboundUrl, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${crmReplySecret}`,
			},
			body: JSON.stringify(event),
		}),
		crmTimeoutMs,
	);
	if (!response.ok) throw new Error(`CRM outbound HTTP ${response.status}`);
	return response.json();
}

app.get("/health", (_req, res) => {
	const disabledReason = replyDisabledReason();
	res.json({
		ok: state === "ready",
		state,
		inboundOnly,
		autoReplyEnabled,
		replyReady: state === "ready" && !disabledReason,
		replyDisabledReason: disabledReason,
		crmConfigured: Boolean(crmReplyUrl),
		crmAuthConfigured: Boolean(crmReplyUrl && crmReplySecret),
		crmOutboundConfigured: Boolean(crmOutboundUrl && crmReplySecret),
		audioTranscriptionConfigured: Boolean(openAiApiKey),
		audioTranscriptionModel: process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1",
		lastQrAt,
		lastMessageAt,
		lastMessageId,
		lastCrmAt,
		lastCrmError,
		lastCrmResult,
		lastDraftAt,
		lastOutboundAt,
		lastOutboundError,
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
	reconnectAttempts = 0;
	console.log("WhatsApp Web autenticado.");
});
client.on("ready", () => {
	state = "ready";
	reconnectAttempts = 0;
	console.log("WhatsApp Web listo. Modo inbound-only:", inboundOnly);
	console.log(
		"Respuesta automática:",
		replyDisabledReason() || "habilitada para respuestas smart de bajo riesgo",
	);
});
client.on("auth_failure", (message) => {
	state = "auth_failure";
	console.error("Falló la autenticación de WhatsApp Web:", message);
});
client.on("disconnected", (reason) => {
	state = "disconnected";
	console.warn("WhatsApp Web desconectado:", reason);
	scheduleReconnect(reason);
});
client.on("change_state", (nextState) => {
	if (nextState === "CONFLICT") scheduleReconnect(nextState);
	if (nextState === "UNPAIRED") state = "awaiting_qr";
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
		serializeMessageId(message) ||
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
			console.error("No se pudo transcribir el audio:", {
				message: lastCrmError,
				name: error instanceof Error ? error.name : "unknown",
				stack: error instanceof Error ? error.stack : undefined,
			});
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
	const sentAt = new Date().toISOString();
	let sentMessage;
	try {
		sentMessage = await message.reply(reply);
	} catch (error) {
		lastOutboundError =
			error instanceof Error ? error.message : "WhatsApp reply failed";
		console.error(
			"No se pudo enviar la respuesta de WhatsApp:",
			lastOutboundError,
		);
		return;
	}
	try {
		await recordCrmOutbound({
			channel: "WHATSAPP_WEB_PILOT",
			externalMessageId:
				sentMessage?.id?._serialized ||
				sentMessage?.id?.id ||
				`${externalMessageId}:reply`,
			externalSenderId: message.from,
			text: reply,
			replyMode: "AUTO_REPLY",
			sentAt,
		});
		lastOutboundAt = sentAt;
		lastOutboundError = null;
	} catch (error) {
		lastOutboundError =
			error instanceof Error ? error.message : "outbound reporting failed";
		console.error(
			"La respuesta se envió, pero no se registró en el CRM:",
			lastOutboundError,
		);
	}
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
