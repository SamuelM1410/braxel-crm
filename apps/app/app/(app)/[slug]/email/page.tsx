import { GmailCampaigns } from "../settings/connections/gmail-campaigns";

export default function EmailPage() {
	return (
		<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)">
			<div className="mx-auto flex w-full max-w-(--container-page) flex-col gap-5">
				<header>
					<h1 className="font-medium text-2xl tracking-tight">
						Gmail outreach
					</h1>
					<p className="text-muted-foreground text-sm">
						Cola de correo, resultados y bajas desde un único apartado. La cola
						solo procesa destinatarios con consentimiento registrado.
					</p>
				</header>
				<GmailCampaigns />
			</div>
		</main>
	);
}
