import { createListSearchParams } from "@/components/data-table/list-search-params";

const COMPANY_FITS = [
	"all",
	"strong",
	"potential",
	"research",
	"excluded",
] as const;

type CompanyFit = (typeof COMPANY_FITS)[number];

export const companiesSearchParams = createListSearchParams({
	defaultSort: "",
	defaultDir: "desc",
	facetIds: ["fit", "owner", "industry", "enrichment"] as const,
	facetDefaults: { fit: "strong" },
});

export function companyListQueryInput<T extends { fit: string }>(input: T) {
	const fit = COMPANY_FITS.includes(input.fit as CompanyFit)
		? (input.fit as CompanyFit)
		: "strong";
	return { ...input, fit };
}
