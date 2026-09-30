import { z } from "zod";

// ScrapeGraphAI is the single lead-research provider exposed by the CRM.
// The old Maps/Mindcase values remain valid in the database for history, but
// are intentionally no longer accepted by the UI/API run action.
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
	limit: z.number().int().min(1).max(50).default(20),
});

export const scraperHistoryInput = z.object({
	limit: z.number().int().min(1).max(50).default(20),
});

export const scraperImportInput = z.object({ id: z.string().min(1) });

export type ScraperRunInput = z.infer<typeof scraperRunInput>;
