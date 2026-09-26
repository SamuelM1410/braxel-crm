"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import { Textarea } from "@crm/ui/components/textarea";
import { LEAD_REVIEW, parseLeadReview } from "@crm/validation";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function LeadReviewActions({
	companyId,
	description,
}: {
	companyId: string;
	description: string | null;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(
		null,
	);
	const [reason, setReason] = useState("");
	const { status, isLead: isReviewLead } = parseLeadReview(description);
	const reasonMissing = LEAD_REVIEW.reason.minLength - reason.trim().length;
	const review = useMutation(
		trpc.companies.reviewLead.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.decision === "APPROVED" ? "Lead aprobado." : "Lead rechazado.",
				);
				void cache.company(companyId, { settle: "record" });
				setDecision(null);
				setReason("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!isReviewLead || status !== "PENDING") return null;

	return (
		<>
			<Button
				size="sm"
				disabled={review.isPending}
				onClick={() => setDecision("APPROVED")}
			>
				Aprobar lead
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={review.isPending}
				onClick={() => setDecision("REJECTED")}
			>
				Rechazar lead
			</Button>

			<AlertDialog
				open={decision !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDecision(null);
						setReason("");
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{decision === "APPROVED"
								? "¿Aprobar este lead?"
								: "¿Rechazar este lead?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{decision === "APPROVED"
								? "Explica por qué esta empresa es una oportunidad comercial real."
								: "El lead queda en No contactar y su canal sigue bloqueado."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Textarea
						placeholder="Motivo de la decisión (obligatorio)"
						value={reason}
						maxLength={LEAD_REVIEW.reason.maxLength}
						required
						onChange={(event) => setReason(event.target.value)}
					/>
					<p className="text-muted-foreground text-xs">
						{reasonMissing > 0
							? `Escribe ${reasonMissing} ${reasonMissing === 1 ? "carácter" : "caracteres"} más para guardar la decisión.`
							: "El motivo se guarda con tu nombre en el historial."}
					</p>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							variant={decision === "REJECTED" ? "destructive" : "default"}
							disabled={review.isPending || reasonMissing > 0 || !decision}
							onClick={() => {
								if (decision)
									review.mutate({ id: companyId, decision, reason });
							}}
						>
							{decision === "APPROVED" ? "Aprobar lead" : "Rechazar lead"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
