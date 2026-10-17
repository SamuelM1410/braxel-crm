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
	description,
	instagramUrl,
	tiktokUrl,
}: {
	companyName: string;
	industry: string | null;
	website: string | null;
	description: string | null;
	instagramUrl: string | null;
	tiktokUrl: string | null;
}): string {
	const sports = /f[uú]tbol|deport|camiseta|uniforme|soccer|sport/i.test(
		`${industry ?? ""} ${companyName}`,
	);
	const research = researchSummary(website, description);
	if (!research.ownedWebsite) {
		const social = instagramUrl
			? "Instagram"
			: tiktokUrl
				? "TikTok"
				: "sus canales sociales";
		return `Hola, ${companyName}. Soy Samuel, de Braxel. Estuve revisando ${social} y la forma en que presentan sus productos. En las fuentes públicas que revisé no pude confirmar un sitio web propio para centralizar catálogo y pedidos (si ya lo tienen, corrígeme). ¿Hoy reciben los pedidos por mensajes o tienen un catálogo centralizado?`;
	}
	if (research.hasCommerce && !research.hasAutomation) {
		return `Hola, ${companyName}. Soy Samuel, de Braxel. Vi que ya tienen una tienda y un canal de WhatsApp para atender pedidos; no encontré evidencia pública de una automatización que recupere carritos o consultas que quedan a medias. ¿Hoy hacen ese seguimiento manualmente o ya tienen un flujo automático?`;
	}
	if (research.hasCommerce) {
		return `Hola, ${companyName}. Soy Samuel, de Braxel. Revisé cómo presentan sus productos y vi una oportunidad concreta para mejorar el paso de visita a compra. No quiero ofrecerles una tienda que ya tienen: me interesa entender dónde se pierden pedidos o consultas. ¿El reto hoy está en conversión, seguimiento por WhatsApp o carritos abandonados?`;
	}
	return sports
		? `Hola, ${companyName}. Soy Samuel, de Braxel. Revisé la oferta de ${companyName} y confirmé que ya tienen un sitio; la oportunidad parece estar en convertir mejor el interés por sus camisetas en pedidos. ¿Hoy reciben las consultas desde la web, WhatsApp o redes, y en qué punto suelen perderse?`
		: `Hola, ${companyName}. Soy Samuel, de Braxel. Revisé la oferta pública de ${companyName} y encontré una oportunidad concreta para convertir mejor las consultas en solicitudes o compras. ¿Hoy el mayor reto está en atraer clientes, convertirlos o hacer seguimiento?`;
}

function buildEmail({
	companyName,
	website,
	description,
	instagramUrl,
	tiktokUrl,
}: {
	companyName: string;
	website: string | null;
	description: string | null;
	instagramUrl: string | null;
	tiktokUrl: string | null;
}): { subject: string; body: string } {
	const research = researchSummary(website, description);
	const subject = !research.ownedWebsite
		? `Una tienda propia para ${companyName}`
		: research.hasCommerce && !research.hasAutomation
			? `Una idea para recuperar carritos en ${companyName}`
			: `Una pregunta sobre el canal de ventas de ${companyName}`;
	const social = instagramUrl
		? "Instagram"
		: tiktokUrl
			? "TikTok"
			: "sus redes";
	const observation = !research.ownedWebsite
		? `Estuve revisando ${social} y la forma en que ${companyName} presenta sus productos. En las fuentes públicas que revisé no pude confirmar un sitio web propio para centralizar catálogo y pedidos (si ya lo tienen, corrígeme). Braxel puede ayudar a convertir el tráfico de redes en pedidos sin perder lo que ya les funciona.`
		: research.hasCommerce && !research.hasAutomation
			? `Estuve revisando la tienda de ${companyName}. Ya tienen el canal de venta y WhatsApp, pero no encontré evidencia pública de recuperación automática de carritos o consultas. La oportunidad sería automatizar ese seguimiento, no reemplazar su web.`
			: `Estuve revisando la oferta pública de ${companyName} y encontré una oportunidad concreta en el paso de interés a pedido. No quiero enviarte una propuesta genérica: primero quiero confirmar cómo están gestionando ese punto.`;
	return {
		subject,
		body: `Hola,\n\nSoy Samuel, de Braxel. ${observation}\n\n¿Hoy el principal reto está en atraer solicitudes, convertir mejor las visitas o recuperar personas que dejan el carrito a medias? Si no es el momento, respóndeme “no” y no volveré a escribirte.\n\nUn saludo,\nSamuel\nBraxel`,
	};
}

type ResearchSummary = {
	ownedWebsite: boolean;
	hasCommerce: boolean;
	hasAutomation: boolean;
};

function researchSummary(
	website: string | null,
	description: string | null,
): ResearchSummary {
	const dossier = parseDossier(description);
	const text = (description ?? "").toLowerCase();
	const ownedWebsite =
		dossier?.digital_presence?.owned_website ?? Boolean(website);
	const hasCommerce =
		/tienda|ecommerce|e-commerce|catalogo|carrito|checkout|comprar|productos/.test(
			text,
		) ||
		Boolean(
			dossier?.commercial_assessment?.recommended_offer?.match(
				/cro|carrito|whatsapp/i,
			),
		);
	const hasAutomation =
		/carrito abandonado|recuperar carrito|automatiz.*whatsapp|chatbot|bot de whatsapp|respuestas automaticas/.test(
			text,
		);
	return { ownedWebsite, hasCommerce, hasAutomation };
}

function parseDossier(description: string | null): {
	digital_presence?: { owned_website?: boolean };
	commercial_assessment?: { recommended_offer?: string };
} | null {
	const line = description
		?.split("\n")
		.find((value) => value.startsWith("Dossier Lead OS: "));
	if (!line) return null;
	try {
		return JSON.parse(line.slice("Dossier Lead OS: ".length)) as {
			digital_presence?: { owned_website?: boolean };
			commercial_assessment?: { recommended_offer?: string };
		};
	} catch {
		return null;
	}
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
	description,
	instagramUrl,
	tiktokUrl,
	whatsappUrl,
	phone,
	email,
}: {
	companyName: string;
	industry: string | null;
	website: string | null;
	description: string | null;
	instagramUrl: string | null;
	tiktokUrl: string | null;
	whatsappUrl: string | null;
	phone: string | null;
	email: string | null;
}) {
	// Keep the copy-ready drafts visible as soon as a company is opened.
	const [expanded, setExpanded] = useState(true);
	const whatsapp = buildWhatsAppMessage({
		companyName,
		industry,
		website,
		description,
		instagramUrl,
		tiktokUrl,
	});
	const emailDraft = buildEmail({
		companyName,
		website,
		description,
		instagramUrl,
		tiktokUrl,
	});
	// A phone-shaped value is not proof that the line is registered on
	// WhatsApp. Only an explicit wa.me/WhatsApp URL enables WhatsApp actions.
	const whatsappDestination = whatsappUrl?.trim() || "";
	const whatsappHref = whatsappChatUrl(whatsappDestination, whatsapp);
	const whatsappWebHref = whatsappWebUrl(whatsappDestination, whatsapp);
	const hasWhatsApp = Boolean(whatsappHref);
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
								{phone
									? "Hay un teléfono para llamada, pero no un enlace WhatsApp verificado; no se tratará como WhatsApp."
									: "No hay un enlace WhatsApp verificado para este lead."}
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
