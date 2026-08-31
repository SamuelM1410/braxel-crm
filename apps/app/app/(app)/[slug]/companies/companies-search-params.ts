import { createListSearchParams } from "@/components/data-table/list-search-params";

export const companiesSearchParams = createListSearchParams({
	defaultSort: "",
	defaultDir: "desc",
	facetIds: ["owner", "industry", "enrichment"] as const,
});
