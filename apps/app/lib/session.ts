import { needsMailboxGrant, type Session } from "@crm/auth";
import { db } from "@crm/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { API_URL } from "@/lib/env";

export const getSession = cache(async (): Promise<Session | null> => {
	const requestHeaders = await headers();
	const response = await fetch(`${API_URL}/api/auth/get-session`, {
		// `headers()` returns an immutable Next.js object in production. `fetch`
		// normalizes request headers internally, so pass it a mutable copy instead.
		headers: new Headers(requestHeaders),
		cache: "no-store",
	});

	if (!response.ok) return null;
	return (await response.json()) as Session | null;
});

export async function requireSession(): Promise<Session> {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	return session;
}

export const signInAccounts = cache(async (userId: string) =>
	db.account.findMany({
		where: { userId },
		select: { providerId: true, scope: true },
	}),
);

export async function requireMailboxAccess(): Promise<Session> {
	const session = await requireSession();

	if (needsMailboxGrant(await signInAccounts(session.user.id))) {
		redirect("/grant-access");
	}

	return session;
}
