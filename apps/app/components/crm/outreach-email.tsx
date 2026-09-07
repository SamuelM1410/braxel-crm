"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function OutreachEmail({
	companyId,
	recipient,
	approved,
	stage,
}: {
	companyId: string;
	recipient: string | null;
	approved: boolean;
	stage: string;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const allowed =
		approved &&
		[
			"INTERESTED",
			"FOLLOW_UP_ACTIVE",
			"QUALIFIED",
			"CLOSING_CALL_BOOKED",
			"PROPOSAL_SENT",
			"PAYMENT_PENDING",
		].includes(stage);

	const send = useMutation(
		trpc.google.sendApprovedEmail.mutationOptions({
			onSuccess: async (result) => {
				await cache.company(companyId, { settle: "record" });
				toast.success(`Email enviado a ${result.recipient}.`);
				setSubject("");
				setBody("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<div className="rounded-md border p-3">
			<p className="font-medium text-sm">Seguimiento por email</p>
			<p className="mt-1 text-muted-foreground text-xs">
				{recipient
					? `Destino: ${recipient}`
					: "No hay email verificado para esta empresa."}
			</p>
			{!allowed ? (
				<p className="mt-2 text-muted-foreground text-xs">
					Requiere interés/etapa positiva y aprobación humana antes de enviar.
				</p>
			) : null}
			<Input
				className="mt-3"
				placeholder="Asunto"
				value={subject}
				onChange={(event) => setSubject(event.target.value)}
			/>
			<Textarea
				className="mt-2 min-h-28"
				placeholder="Pega o ajusta aquí el borrador de Eve antes de enviarlo"
				value={body}
				onChange={(event) => setBody(event.target.value)}
			/>
			<Button
				className="mt-2 w-full"
				disabled={
					!allowed ||
					!recipient ||
					!subject.trim() ||
					!body.trim() ||
					send.isPending
				}
				onClick={() => send.mutate({ companyId, subject, body })}
			>
				{send.isPending ? "Enviando…" : "Enviar email aprobado"}
			</Button>
			<p className="mt-2 text-muted-foreground text-xs">
				Eve prepara el texto; una persona revisa y confirma este envío.
			</p>
		</div>
	);
}
