"use client";

import Renew from "@carbon/icons-react/es/Renew";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Status = RouterOutputs["scrapers"]["status"];
type Run = Status["runs"][number];

export function ScraperControl() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const status = useQuery({
		...trpc.scrapers.status.queryOptions(),
		refetchInterval: 15_000,
	});
	const [targetUrl, setTargetUrl] = useState("");
	const [limit, setLimit] = useState("20");
	const [selected, setSelected] = useState<Run | null>(null);

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.scrapers.status.queryKey(),
		});
	const run = useMutation(
		trpc.scrapers.run.mutationOptions({
			onSuccess: (result) => {
				setSelected(result);
				refresh();
				if (result.status === "SUCCEEDED")
					toast.success(`${result.resultCount} candidatos encontrados.`);
				else
					toast.error(
						result.error ?? "El scraper no pudo completar la ejecución.",
					);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const importRun = useMutation(
		trpc.scrapers.import.mutationOptions({
			onSuccess: (result) => {
				refresh();
				toast.success(
					`${result.imported} candidatos importados para revisión.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (status.isPending || !status.data)
		return (
			<main className="flex flex-1 items-center justify-center">
				<Spinner size="lg" />
			</main>
		);
	const data = status.data;
	return (
		<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)">
			<div className="mx-auto flex w-full max-w-(--container-page) flex-col gap-5">
				<header>
					<h1 className="font-medium text-2xl tracking-tight">
						Lead generation
					</h1>
					<p className="text-muted-foreground text-sm">
						Ejecuta el scraper configurado, revisa la evidencia y decide cuándo
						importar los resultados al CRM.
					</p>
				</header>

				<Card>
					<CardHeader>
						<CardTitle>ScrapeGraphAI</CardTitle>
						<CardDescription>
							El único proveedor activo. Maps y Mindcase ya no forman parte de
							este flujo.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<SourceStatus
							label="Worker local configurado"
							configured={data.providers.scrapegraph.configured}
							reachable={data.providers.scrapegraph.reachable}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Ejecutar scraper</CardTitle>
						<CardDescription>
							Usa la configuración existente. Puedes dejar la URL vacía para
							utilizar la fuente predeterminada del worker. Nada se contacta
							automáticamente.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							className="grid gap-3 sm:grid-cols-[1fr_7rem_auto]"
							onSubmit={(event) => {
								event.preventDefault();
								run.mutate({
									provider: "SCRAPEGRAPH",
									query: targetUrl.trim(),
									limit: Number(limit),
								});
							}}
						>
							<Input
								value={targetUrl}
								onChange={(event) => setTargetUrl(event.target.value)}
								placeholder="URL pública opcional (usa la configuración guardada si queda vacía)"
							/>
							<Input
								className="text-center"
								inputMode="numeric"
								min={1}
								max={50}
								type="number"
								value={limit}
								onChange={(event) => setLimit(event.target.value)}
								aria-label="Límite de resultados"
							/>
							<Button type="submit" disabled={run.isPending}>
								{run.isPending ? (
									<Spinner data-icon="inline-start" />
								) : (
									<Renew data-icon="inline-start" />
								)}
								{run.isPending ? "Ejecutando…" : "Ejecutar"}
							</Button>
						</form>
						<p className="mt-3 text-muted-foreground text-xs">
							Los candidatos importados quedan en revisión y con “No contactar”
							activo hasta que una persona los verifique.
						</p>
					</CardContent>
				</Card>

				{selected ? (
					<RunResult
						run={selected}
						importing={importRun.isPending}
						onImport={() => importRun.mutate({ id: selected.id })}
					/>
				) : null}

				<Card>
					<CardHeader>
						<CardTitle>Historial de ejecuciones</CardTitle>
					</CardHeader>
					<CardContent>
						{data.runs.length ? (
							<div className="divide-y rounded-md border">
								{data.runs.map((item) => (
									<button
										type="button"
										key={item.id}
										className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
										onClick={() => setSelected(item)}
									>
										<span className="min-w-0 flex-1">
											<span className="block font-medium text-sm">
												ScrapeGraphAI · {item.query}
											</span>
											<span className="text-muted-foreground text-xs">
												{new Date(item.createdAt).toLocaleString()}
											</span>
										</span>
										<span className="text-muted-foreground text-xs">
											{item.resultCount} resultados
										</span>
										<StatusIndicator
											size="sm"
											tone={
												item.status === "SUCCEEDED"
													? "success"
													: item.status === "FAILED"
														? "error"
														: "warning"
											}
											label={item.status.toLowerCase()}
										/>
									</button>
								))}
							</div>
						) : (
							<p className="text-muted-foreground text-sm">
								Todavía no hay ejecuciones.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</main>
	);
}

function SourceStatus({
	label,
	configured,
	reachable,
}: {
	label: string;
	configured: boolean;
	reachable: boolean;
}) {
	return (
		<div className="flex items-center justify-between rounded-md border p-3">
			<div>
				<p className="font-medium text-sm">{label}</p>
				<p className="text-muted-foreground text-xs">
					{!configured
						? "No configurado"
						: reachable
							? "Disponible"
							: "Configurado, pero no responde"}
				</p>
			</div>
			<StatusIndicator
				size="sm"
				tone={reachable ? "success" : configured ? "warning" : "neutral"}
				label={reachable ? "Ready" : configured ? "Offline" : "Off"}
			/>
		</div>
	);
}

function RunResult({
	run,
	importing,
	onImport,
}: {
	run: Run;
	importing: boolean;
	onImport: () => void;
}) {
	const rows = Array.isArray(run.results) ? run.results : [];
	return (
		<Card>
			<CardHeader>
				<CardTitle>Resultado · {run.resultCount} candidatos</CardTitle>
				<CardDescription>
					{run.error ?? "Revisa la evidencia antes de importar."}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="max-h-80 overflow-auto rounded-md border p-3 font-mono text-xs">
					{rows.length ? (
						rows.slice(0, 20).map((row) => (
							<pre
								key={JSON.stringify(row)}
								className="border-b py-2 last:border-b-0"
							>
								{JSON.stringify(row, null, 2)}
							</pre>
						))
					) : (
						<p className="text-muted-foreground">No hay resultados.</p>
					)}
				</div>
				{run.status === "SUCCEEDED" && rows.length ? (
					<Button variant="outline" disabled={importing} onClick={onImport}>
						{importing ? <Spinner data-icon="inline-start" /> : null}Importar
						para revisión
					</Button>
				) : null}
			</CardContent>
		</Card>
	);
}
