import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Condiciones del servicio",
	description: "Condiciones del servicio de Braxel.",
};

export default function TermsPage() {
	return (
		<main className="min-h-svh bg-background px-6 py-16 text-foreground">
			<article className="mx-auto max-w-3xl space-y-8">
				<header className="space-y-3">
					<p className="text-sm font-medium text-muted-foreground">Braxel</p>
					<h1 className="text-4xl font-semibold tracking-tight">
						Condiciones del servicio
					</h1>
					<p className="text-sm text-muted-foreground">
						Última actualización: 12 de septiembre de 2026
					</p>
				</header>
				<p>
					Braxel ofrece herramientas para organizar datos comerciales,
					conexiones autorizadas y recomendaciones. La persona usuaria es
					responsable de contar con una base legal para los datos que incorpora
					y de usar los canales de comunicación conforme a las políticas de cada
					plataforma y a la ley aplicable.
				</p>
				<p>
					Las recomendaciones automatizadas no garantizan resultados
					comerciales. La persona usuaria revisa y aprueba las acciones que se
					ejecutan mediante cuentas conectadas.
				</p>
				<p>
					Podemos modificar estas condiciones para mejorar el servicio o cumplir
					requisitos legales. El uso continuo de Braxel después de una
					actualización constituye aceptación de la versión vigente.
				</p>
			</article>
		</main>
	);
}
