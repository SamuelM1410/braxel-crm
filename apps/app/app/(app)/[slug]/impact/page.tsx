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
import { ImpactDashboard } from "./impact-dashboard";

export const metadata: Metadata = {
	title: "Impact",
};

export default function ImpactPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Impacto</PageShellTitle>
					<PageShellDescription>
						Cuántos leads revisó una persona, cuánto tiempo se ahorra y cómo se
						evita contactar sin autorización.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Impact />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Impact() {
	await requireSession();

	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		getServerTrpc().leadImpact.summary.queryOptions(),
	);

	return (
		<HydrateClient>
			<ImpactDashboard />
		</HydrateClient>
	);
}
