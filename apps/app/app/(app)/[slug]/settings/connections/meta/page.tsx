import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { MetaConnection } from "../meta-connection";

export const metadata: Metadata = { title: "Meta Business" };

export default function MetaConnectionPage(props: {
	params: Promise<{ slug: string }>;
}) {
	return (
		<Suspense fallback={null}>
			<MetaConnectionPageContent {...props} />
		</Suspense>
	);
}

async function MetaConnectionPageContent({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	await requireSession();
	const { slug } = await params;
	return <MetaConnection slug={slug} />;
}
