import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { LeadFinanceDashboard } from "./lead-finance-dashboard";

export const metadata: Metadata = {
	title: "Finance",
};

export default function LeadFinancePage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Sostenibilidad financiera</PageShellTitle>
					<PageShellDescription>
						Probabilidad de cierre, valor esperado, costo por contacto y punto
						de equilibrio, con supuestos que puedes ajustar.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Portfolio />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Portfolio() {
	await requireSession();

	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		getServerTrpc().leadFinance.portfolio.queryOptions(),
	);

	return (
		<HydrateClient>
			<LeadFinanceDashboard />
		</HydrateClient>
	);
}
