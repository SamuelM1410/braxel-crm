import type { Metadata } from "next";
import { ScraperControl } from "../settings/scrapers/scraper-control";

export const metadata: Metadata = { title: "Lead generation" };

export default function LeadsPage() {
	return <ScraperControl />;
}
