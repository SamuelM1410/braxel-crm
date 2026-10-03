import { z } from "zod";

// ScrapeGraphAI remains the lead-research provider exposed by the CRM. When
// the query is not a URL, the service first uses a configured discovery source
// (the legacy local Maps scraper or Google Places) and then enriches each
// public website with ScrapeGraph.
export const scraperProvider = z.enum(["SCRAPEGRAPH"]);
export type ScraperProvider = z.infer<typeof scraperProvider>;

export const mindcaseAgent = z.enum([
	"instagram/profiles",
	"instagram/posts",
	"tiktok/profiles",
	"tiktok/posts",
	"linkedin/profiles",
	"linkedin/companies",
	"linkedin/posts",
	"facebook/pages",
	"facebook/posts-groups",
]);

export const scraperRunInput = z.object({
	provider: scraperProvider,
	query: z.string().trim().max(500).default(""),
	limit: z.number().int().min(1).max(100).default(30),
});

export const scraperHistoryInput = z.object({
	limit: z.number().int().min(1).max(100).default(30),
});

export const scraperImportInput = z.object({ id: z.string().min(1) });

export type ScraperRunInput = z.infer<typeof scraperRunInput>;
