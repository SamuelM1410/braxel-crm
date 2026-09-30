import type { Metadata } from "next";
import { ScraperControl } from "./scraper-control";

export const metadata: Metadata = { title: "Scrapers" };

export default function ScrapersPage() {
	return <ScraperControl />;
}
