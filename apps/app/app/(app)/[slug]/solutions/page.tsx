import type { Metadata } from "next";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { SolutionsCatalog } from "./solutions-catalog";

export const metadata: Metadata = {
	title: "Custom solutions",
};

export const instant = false;

export default function SolutionsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Soluciones personalizadas</PageShellTitle>
					<PageShellDescription>
						Módulos sencillos que Braxel puede adaptar a la operación de cada
						empresa sin vender el CRM interno.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<SolutionsCatalog />
			</PageShellContent>
		</PageShell>
	);
}
