"use client";

import Copy from "@carbon/icons-react/es/Copy";
import Send from "@carbon/icons-react/es/Send";
import { Button } from "@crm/ui/components/button";
import { Textarea } from "@crm/ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";

function buildWhatsAppMessage({
	companyName,
	industry,
	website,
}: {
	companyName: string;
	industry: string | null;
	website: string | null;
}): string {
	const sports = /f[uú]tbol|deport|camiseta|uniforme|soccer|sport/i.test(
		`${industry ?? ""} ${companyName}`,
	);
	if (!website) {
		return sports
			? `Hola, ${companyName}. Soy Samuel, de Braxel. Estuve revisando cómo aparece el negocio y no encontré una página web propia para mostrar el catálogo y recibir pedidos. Para una marca deportiva eso puede hacer que parte del interés se quede solo en WhatsApp o Instagram. ¿Hoy reciben los pedidos únicamente por esos canales?`
			: `Hola, ${companyName}. Soy Samuel, de Braxel. Estuve revisando la presencia online del negocio y no encontré una página web propia donde explicar la oferta y recibir solicitudes. ¿Hoy los clientes llegan principalmente por WhatsApp, redes sociales o recomendaciones?`;
	}
	return `Hola, ${companyName}. Soy Samuel, de Braxel. Revisé su presencia online y vi una oportunidad concreta para que la página convierta mejor las visitas en consultas o pedidos. Antes de compartirte una idea específica, ¿qué parte quieren mejorar primero: catálogo, solicitudes o ventas?`;
}

function buildEmail({
	companyName,
	industry,
	website,
}: {
	companyName: string;
	industry: string | null;
	website: string | null;
}): { subject: string; body: string } {
	const noWebsite = !website;
	const subject = noWebsite
		? `Una idea para que ${companyName} reciba más pedidos online`
		: `Una observación sobre la web de ${companyName}`;
	const observation = noWebsite
		? `Estuve revisando la presencia pública de ${companyName} y no encontré una página web propia. Para negocios${industry ? ` de ${industry.toLowerCase()}` : ""}, una página sencilla puede reunir catálogo, confianza y pedidos en un solo lugar.`
		: `Estuve revisando la presencia pública de ${companyName} y vi una oportunidad concreta para mejorar el recorrido desde la visita hasta la consulta o el pedido.`;
	return {
		subject,
		body: `Hola,\n\nSoy Samuel, de Braxel. ${observation}\n\nNo quiero enviarte una propuesta genérica. ¿Hoy reciben pedidos principalmente por WhatsApp/redes, o ya tienen un canal web que quieran mejorar? Si no es el momento, respóndeme “no” y no volveré a escribirte.\n\nUn saludo,\nSamuel\nBraxel`,
	};
}

function whatsappChatUrl(destination: string, message: string): string | null {
	const value = destination.trim();
	if (!value) return null;
	if (/^https?:\/\//i.test(value)) {
		try {
			const url = new URL(value);
			url.searchParams.set("text", message);
			return url.toString();
		} catch {
			return null;
		}
	}

	const digits = value.replace(/\D/g, "");
	if (!digits) return null;
	// Scrapers often return a local Colombian number. wa.me requires the
	// international country code, so make the common 10-digit case explicit.
	const phone =
		digits.length === 10 && digits.startsWith("3") ? `57${digits}` : digits;
	return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function whatsappWebUrl(destination: string, message: string): string | null {
	const value = destination.trim();
	if (!value) return null;

	let phone = value;
	if (/^https?:\/\//i.test(value)) {
		try {
			const url = new URL(value);
			phone = url.searchParams.get("phone") ?? url.pathname.replace(/^\/+/, "");
		} catch {
			return null;
		}
	}

	const digits = phone.replace(/\D/g, "");
	if (!digits) return null;
	const normalizedPhone =
		digits.length === 10 && digits.startsWith("3") ? `57${digits}` : digits;
	const params = new URLSearchParams({
		phone: normalizedPhone,
		text: message,
		braxel_auto_send: "1",
	});
	return `https://web.whatsapp.com/send?${params.toString()}`;
}

function gmailComposeUrl(
	email: string,
	draft: { subject: string; body: string },
): string {
	const params = new URLSearchParams({
		authuser: "braxeldev@gmail.com",
		view: "cm",
		fs: "1",
		to: email,
		su: draft.subject,
		body: draft.body,
	});
	return `https://mail.google.com/mail/?${params.toString()}`;
}

async function copyText(text: string, label: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(`${label} copiado al portapapeles.`);
	} catch {
		toast.error("No se pudo copiar. Selecciona el texto y usa Ctrl/Cmd+C.");
	}
}

export function OutreachCopyKit({
	companyName,
	industry,
	website,
	whatsappUrl,
	phone,
	email,
}: {
	companyName: string;
	industry: string | null;
	website: string | null;
	whatsappUrl: string | null;
	phone: string | null;
	email: string | null;
}) {
	// Keep the copy-ready drafts visible as soon as a company is opened.
	const [expanded, setExpanded] = useState(true);
	const whatsapp = buildWhatsAppMessage({ companyName, industry, website });
	const emailDraft = buildEmail({ companyName, industry, website });
	const whatsappDestination = whatsappUrl?.trim() || phone?.trim() || "";
	const whatsappHref = whatsappChatUrl(whatsappDestination, whatsapp);
	const whatsappWebHref = whatsappWebUrl(whatsappDestination, whatsapp);
	const hasWhatsApp = Boolean(whatsappHref);
	const usingPhoneFallback = !whatsappUrl?.trim() && Boolean(phone?.trim());
	const hasEmail = Boolean(email?.trim());
	const gmailHref = hasEmail
		? gmailComposeUrl(email?.trim() ?? "", emailDraft)
		: undefined;

	return (
		<div className="rounded-md border bg-muted/20 p-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-medium text-sm">Mensajes listos para enviar</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Revisa el texto y confirma que tienes permiso para contactar a este
						lead. El botón de WhatsApp abre el chat y envía el mensaje mediante
						la extensión local de Chrome.
					</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setExpanded((value) => !value)}
				>
					{expanded ? "Ocultar" : "Ver mensajes"}
				</Button>
			</div>

			{expanded ? (
				<div className="mt-3 space-y-3">
					<div>
						<div className="mb-1 flex items-center justify-between gap-2">
							<span className="font-medium text-xs">WhatsApp</span>
							<div className="flex gap-2">
								<Button
									variant="default"
									size="sm"
									disabled={!whatsappWebHref}
									onClick={() => {
										if (!whatsappWebHref) return;
										window.open(
											whatsappWebHref,
											"_blank",
											"noopener,noreferrer",
										);
									}}
								>
									<Send size={16} />
									Enviar por WhatsApp
								</Button>
								<Button variant="outline" size="sm" asChild>
									<a
										href={whatsappHref ?? undefined}
										target="_blank"
										rel="noopener noreferrer"
										aria-disabled={!hasWhatsApp}
										className={
											!hasWhatsApp
												? "pointer-events-none opacity-50"
												: undefined
										}
									>
										Abrir chat
									</a>
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={!hasWhatsApp}
									onClick={() => copyText(whatsapp, "Mensaje de WhatsApp")}
								>
									<Copy size={16} />
									Copiar
								</Button>
							</div>
						</div>
						<p className="mb-2 text-muted-foreground text-xs">
							Requiere la extensión local Braxel WhatsApp Sender en Chrome.
						</p>
						<Textarea value={whatsapp} readOnly className="min-h-24 text-xs" />
						{!hasWhatsApp ? (
							<p className="mt-1 text-muted-foreground text-xs">
								Añade el WhatsApp de la empresa para habilitar este botón.
							</p>
						) : usingPhoneFallback ? (
							<p className="mt-1 text-muted-foreground text-xs">
								Se usará el teléfono guardado con el código de país de Colombia.
							</p>
						) : null}
					</div>

					<div>
						<div className="mb-1 flex items-center justify-between gap-2">
							<span className="font-medium text-xs">Gmail</span>
							<Button
								variant="outline"
								size="sm"
								disabled={!hasEmail}
								onClick={() =>
									copyText(
										`Asunto: ${emailDraft.subject}\n\n${emailDraft.body}`,
										"Borrador de Gmail",
									)
								}
							>
								<Copy size={16} />
								Copiar Gmail
							</Button>
							<Button variant="outline" size="sm" disabled={!hasEmail} asChild>
								<a href={gmailHref} target="_blank" rel="noopener noreferrer">
									Abrir Gmail
								</a>
							</Button>
						</div>
						<p className="mt-1 text-muted-foreground text-xs">
							Se abrirá la cuenta de Braxel. Si no está iniciada, Gmail pedirá
							seleccionarla antes de mostrar el borrador.
						</p>
						<Textarea
							value={`Asunto: ${emailDraft.subject}\n\n${emailDraft.body}`}
							readOnly
							className="min-h-36 text-xs"
						/>
						{!hasEmail ? (
							<p className="mt-1 text-muted-foreground text-xs">
								Añade un email para habilitar este botón.
							</p>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
