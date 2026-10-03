"use client";

import Copy from "@carbon/icons-react/es/Copy";
import { Button } from "@crm/ui/components/button";
import { Textarea } from "@crm/ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";

function buildWhatsAppMessage(companyName: string): string {
	return `Hola, ${companyName}. Soy Samuel, de Braxel. Vi su negocio y creo que podemos ayudarles a convertir mejor las visitas de su página en clientes y recuperar oportunidades que se quedan a medias. ¿Te puedo compartir una idea breve y sin compromiso?`;
}

function buildEmail(companyName: string): { subject: string; body: string } {
	return {
		subject: `Una idea para mejorar las conversiones de ${companyName}`,
		body: `Hola,\n\nSoy Samuel, de Braxel. Estuve revisando ${companyName} y vimos una oportunidad concreta para convertir mejor las visitas de su página en clientes y recuperar oportunidades que se quedan a medias.\n\n¿Te puedo compartir una idea breve, con ejemplos y sin compromiso? Si no es el momento, respóndeme “no” y no volveré a escribirte.\n\nUn saludo,\nSamuel\nBraxel`,
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
	whatsappUrl,
	phone,
	email,
}: {
	companyName: string;
	whatsappUrl: string | null;
	phone: string | null;
	email: string | null;
}) {
	// Keep the copy-ready drafts visible as soon as a company is opened.
	const [expanded, setExpanded] = useState(true);
	const whatsapp = buildWhatsAppMessage(companyName);
	const emailDraft = buildEmail(companyName);
	const whatsappDestination = whatsappUrl?.trim() || phone?.trim() || "";
	const whatsappHref = whatsappChatUrl(whatsappDestination, whatsapp);
	const hasWhatsApp = Boolean(whatsappHref);
	const usingPhoneFallback = !whatsappUrl?.trim() && Boolean(phone?.trim());
	const hasEmail = Boolean(email?.trim());

	return (
		<div className="rounded-md border bg-muted/20 p-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-medium text-sm">Mensajes listos para enviar</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Revisa el texto y cópialo manualmente después de confirmar que
						tienes permiso para contactar a este lead. Braxel no envía nada
						automáticamente.
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
						</div>
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
