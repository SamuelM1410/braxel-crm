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
	const status = reviewStatus(description);
	const isReviewLead = /^Lead OS source:/m.test(description ?? "");
	const review = useMutation(
		trpc.companies.reviewLead.mutationOptions({
			onSuccess: (result) => {
				toast.success(`Lead ${result.decision.toLowerCase()}.`);
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
				Approve lead
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={review.isPending}
				onClick={() => setDecision("REJECTED")}
			>
				Reject lead
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
								? "Approve this lead?"
								: "Reject this lead?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{decision === "APPROVED"
								? "Record why this company is a real commercial opportunity."
								: "Lead OS will add this company to its do-not-contact list."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Textarea
						placeholder="Reason for this decision (required)"
						value={reason}
						onChange={(event) => setReason(event.target.value)}
					/>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant={decision === "REJECTED" ? "destructive" : "default"}
							disabled={
								review.isPending || reason.trim().length < 3 || !decision
							}
							onClick={() => {
								if (decision)
									review.mutate({ id: companyId, decision, reason });
							}}
						>
							{decision === "APPROVED" ? "Approve lead" : "Reject lead"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function reviewStatus(description: string | null) {
	return description?.match(/^Revisión:\s*(.+)$/m)?.[1]?.trim() ?? null;
}
