"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Input } from "@crm/ui/components/input";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

function parseRecipients(
	value: string,
	subject: string,
	body: string,
	source: string,
) {
	const consentAt = new Date();
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((recipient) => ({
			recipient,
			subject,
			body,
			consentAt,
			consentSource: source,
		}));
}

function statusLabel(status: CampaignStatus) {
	return {
		DRAFT: "Borrador",
		ACTIVE: "Activa",
		PAUSED: "Pausada",
		COMPLETED: "Completada",
		CANCELLED: "Cancelada",
	}[status];
}

export function GmailCampaigns() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const campaigns = useQuery(trpc.google.campaigns.queryOptions());
	const [name, setName] = useState("");
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [recipients, setRecipients] = useState("");
	const [consentSource, setConsentSource] = useState(
		"Formulario o conversación con consentimiento",
	);
	const [optOutEmail, setOptOutEmail] = useState("");
	const [confirmed, setConfirmed] = useState(false);

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.google.campaigns.queryKey(),
		});

	const create = useMutation(
		trpc.google.createCampaign.mutationOptions({
			onSuccess: async () => {
				await refresh();
				setName("");
				setSubject("");
				setBody("");
				setRecipients("");
				setConfirmed(false);
				toast.success("Campaña creada como borrador.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const activate = useMutation(
		trpc.google.activateCampaign.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success(
					"Campaña activada. La cola respetará los límites configurados.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const pause = useMutation(
		trpc.google.pauseCampaign.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Campaña pausada.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const run = useMutation(
		trpc.google.runCampaign.mutationOptions({
			onSuccess: async (result) => {
				await refresh();
				toast.success(
					`Cola ejecutada: ${result.sent} enviados, ${result.failed} fallidos.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const optOut = useMutation(
		trpc.google.optOutRecipient.mutationOptions({
			onSuccess: async (result) => {
				await refresh();
				setOptOutEmail("");
				toast.success(`${result.recipient} quedó excluido de la cola.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const items = parseRecipients(recipients, subject, body, consentSource);
		if (!confirmed) {
			toast.error(
				"Confirma que todos los destinatarios dieron consentimiento.",
			);
			return;
		}
		if (items.length === 0) {
			toast.error("Añade al menos un email, uno por línea.");
			return;
		}
		create.mutate({
			name,
			subjectTemplate: subject,
			bodyTemplate: body,
			dailyLimit: 25,
			perMinuteLimit: 2,
			items,
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Campañas Gmail</CardTitle>
				<CardDescription>
					Cola automática con consentimiento registrado, límite de 25 mensajes
					al día y 2 por minuto. Los resultados quedan visibles aquí.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<form className="space-y-2 rounded-md border p-3" onSubmit={submit}>
					<p className="font-medium text-sm">Crear campaña</p>
					<p className="text-muted-foreground text-xs">
						Un destinatario por línea. Solo usa contactos con permiso explícito
						para recibir este tipo de email.
					</p>
					<Input
						required
						placeholder="Nombre de la campaña"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
					<Input
						required
						placeholder="Asunto"
						value={subject}
						onChange={(event) => setSubject(event.target.value)}
					/>
					<Textarea
						required
						className="min-h-28"
						placeholder="Mensaje"
						value={body}
						onChange={(event) => setBody(event.target.value)}
					/>
					<Textarea
						required
						className="min-h-20"
						placeholder="email1@dominio.com\nemail2@dominio.com"
						value={recipients}
						onChange={(event) => setRecipients(event.target.value)}
					/>
					<Input
						required
						placeholder="Origen del consentimiento"
						value={consentSource}
						onChange={(event) => setConsentSource(event.target.value)}
					/>
					<label className="flex items-start gap-2 text-muted-foreground text-xs">
						<input
							type="checkbox"
							checked={confirmed}
							onChange={(event) => setConfirmed(event.target.checked)}
						/>
						<span>
							Confirmo que todos los destinatarios aceptaron recibir estos
							mensajes y que respetaremos sus bajas.
						</span>
					</label>
					<Button type="submit" disabled={create.isPending}>
						{create.isPending ? "Creando…" : "Crear borrador"}
					</Button>
				</form>

				<div className="space-y-2">
					<p className="font-medium text-sm">Cola</p>
					{campaigns.isPending ? (
						<p className="text-muted-foreground text-xs">Cargando campañas…</p>
					) : null}
					{campaigns.data?.length === 0 ? (
						<p className="text-muted-foreground text-xs">
							Aún no hay campañas.
						</p>
					) : null}
					{campaigns.data?.map((campaign) => (
						<div
							className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
							key={campaign.id}
						>
							<div>
								<p className="font-medium text-sm">{campaign.name}</p>
								<p className="text-muted-foreground text-xs">
									{statusLabel(campaign.status as CampaignStatus)} ·{" "}
									{campaign._count.items} destinatarios · {campaign.stats.sent}{" "}
									enviados · {campaign.stats.queued} en cola ·{" "}
									{campaign.stats.failed} fallidos
								</p>
							</div>
							<div className="flex gap-2">
								{campaign.status === "ACTIVE" ? (
									<Button
										size="xs"
										variant="outline"
										onClick={() => pause.mutate({ campaignId: campaign.id })}
									>
										Pausar
									</Button>
								) : campaign.status !== "COMPLETED" &&
									campaign.status !== "CANCELLED" ? (
									<Button
										size="xs"
										onClick={() => activate.mutate({ campaignId: campaign.id })}
									>
										Activar
									</Button>
								) : null}
								{campaign.status === "ACTIVE" ? (
									<Button
										size="xs"
										variant="outline"
										onClick={() => run.mutate({ campaignId: campaign.id })}
									>
										Ejecutar ahora
									</Button>
								) : null}
							</div>
						</div>
					))}
				</div>

				<form
					className="flex flex-wrap items-center gap-2 rounded-md border p-3"
					onSubmit={(event) => {
						event.preventDefault();
						optOut.mutate({ recipient: optOutEmail });
					}}
				>
					<div className="min-w-56 flex-1">
						<p className="font-medium text-sm">Excluir destinatario</p>
						<p className="text-muted-foreground text-xs">
							Detiene envíos pendientes y evita volver a poner este email en
							cola.
						</p>
					</div>
					<Input
						required
						type="email"
						placeholder="persona@dominio.com"
						value={optOutEmail}
						onChange={(event) => setOptOutEmail(event.target.value)}
					/>
					<Button type="submit" variant="outline" disabled={optOut.isPending}>
						{optOut.isPending ? "Guardando…" : "Marcar baja"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
