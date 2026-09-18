"use client";

import LogoFacebook from "@carbon/icons-react/es/LogoFacebook";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function MetaConnection({ slug }: { slug: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const status = useQuery(trpc.meta.status.queryOptions());
	const threads = useQuery(trpc.meta.threads.queryOptions({ limit: 20 }));
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: trpc.meta.status.queryKey() });
	const assistant = useMutation(
		trpc.meta.setAssistant.mutationOptions({
			onSuccess: refresh,
			onError: (e) => toast.error(e.message),
		}),
	);
	const disconnect = useMutation(
		trpc.meta.disconnect.mutationOptions({
			onSuccess: refresh,
			onError: (e) => toast.error(e.message),
		}),
	);

	if (status.isPending)
		return (
			<main className="flex flex-1 items-center justify-center">
				<Spinner size="lg" />
			</main>
		);
	const meta = status.data;
	return (
		<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-(--spacing-page-inline) pt-(--spacing-page-top) pb-(--spacing-page-bottom)">
			<div className="mx-auto flex w-full max-w-(--container-page) flex-col gap-5">
				<header>
					<h1 className="font-medium text-2xl tracking-tight">Meta Business</h1>
					<p className="text-muted-foreground text-sm">
						Facebook Pages and connected Instagram professional accounts.
					</p>
				</header>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<LogoFacebook className="size-5" /> Meta{" "}
							<StatusIndicator
								size="sm"
								tone={meta?.connected ? "success" : "neutral"}
								label={meta?.connected ? "Connected" : "Not connected"}
							/>
						</CardTitle>
						<CardDescription>
							{meta?.configured
								? "Connect once, then Braxel receives replies through the official Meta webhook."
								: "The server still needs the four META_* environment variables."}
						</CardDescription>
					</CardHeader>
					{meta?.connected ? (
						<CardContent className="space-y-4">
							<div>
								<p className="font-medium text-sm">
									{meta.displayName ?? "Meta account"}
								</p>
								<p className="text-muted-foreground text-xs">
									{meta.pages.length} page(s) available
								</p>
							</div>
							<div className="divide-y rounded-md border">
								{meta.pages.map((page) => (
									<div
										key={page.id}
										className="flex items-center justify-between gap-4 p-3"
									>
										<div>
											<p className="font-medium text-sm">{page.name}</p>
											<p className="text-muted-foreground text-xs">
												Facebook
												{page.instagramUsername
													? ` · Instagram @${page.instagramUsername}`
													: " · no connected Instagram professional account"}
											</p>
										</div>
										<StatusIndicator
											size="sm"
											tone={page.enabled ? "success" : "neutral"}
											label={page.enabled ? "Listening" : "Off"}
										/>
									</div>
								))}
							</div>
							<div className="flex items-center justify-between gap-4 rounded-md border p-3">
								<div>
									<p className="font-medium text-sm">Eve reply assistant</p>
									<p className="text-muted-foreground text-xs">
										Replies only after an inbound message. Risky cases require
										human review.
									</p>
								</div>
								<Switch
									checked={meta.replyAssistantEnabled}
									disabled={assistant.isPending}
									onCheckedChange={(enabled) => assistant.mutate({ enabled })}
								/>
							</div>
						</CardContent>
					) : null}
					<CardFooter className="gap-2">
						{meta?.connected ? (
							<Button
								variant="destructive"
								disabled={disconnect.isPending}
								onClick={() => disconnect.mutate()}
							>
								Disconnect
							</Button>
						) : (
							<Button asChild disabled={!meta?.configured}>
								<Link
									href={`/api/meta/connect?returnUrl=/${slug}/settings/connections/meta`}
								>
									<LogoFacebook data-icon="inline-start" /> Connect Meta
								</Link>
							</Button>
						)}
						<Button asChild variant="outline">
							<Link href={`/${slug}/settings/connections`}>Back</Link>
						</Button>
					</CardFooter>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Recent conversations</CardTitle>
						<CardDescription>
							Inbound Facebook and Instagram messages are routed to Eve for a
							human-approved draft.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{threads.isPending ? (
							<p className="text-muted-foreground text-sm">
								Loading conversations…
							</p>
						) : threads.data?.length ? (
							<div className="divide-y rounded-md border">
								{threads.data.map((thread) => {
									const latest = thread.messages[0];
									const name = thread.contact
										? [thread.contact.firstName, thread.contact.lastName]
												.filter(Boolean)
												.join(" ")
										: (thread.company?.name ?? thread.externalSenderId);
									return (
										<div key={thread.id} className="space-y-1 p-3">
											<div className="flex items-center justify-between gap-3">
												<p className="font-medium text-sm">{name}</p>
												<span className="text-muted-foreground text-xs">
													{thread.channel}
												</span>
											</div>
											<p className="line-clamp-2 text-muted-foreground text-sm">
												{latest?.body ?? "No text message"}
											</p>
											<p className="text-muted-foreground text-xs">
												{new Date(thread.lastMessageAt).toLocaleString()}
											</p>
										</div>
									);
								})}
							</div>
						) : (
							<p className="text-muted-foreground text-sm">
								No inbound conversations yet.
							</p>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Meta App setup</CardTitle>
						<CardDescription>
							Use callback <code>{meta?.callbackUrl}</code> and webhook{" "}
							<code>{meta?.webhookUrl}</code>. Subscribe the Page and Instagram
							messaging products. Braxel never starts mass outreach from this
							connection.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		</main>
	);
}
