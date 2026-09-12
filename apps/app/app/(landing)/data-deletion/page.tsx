import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Eliminación de datos",
	description: "Cómo solicitar la eliminación de datos de Braxel.",
};

export default function DataDeletionPage() {
	return (
		<main className="min-h-svh bg-background px-6 py-16 text-foreground">
			<article className="mx-auto max-w-3xl space-y-8">
				<header className="space-y-3">
					<p className="text-sm font-medium text-muted-foreground">Braxel</p>
					<h1 className="text-4xl font-semibold tracking-tight">
						Solicitud de eliminación de datos
					</h1>
				</header>
				<p>
					Para eliminar datos asociados a una conexión de Meta, envía un correo
					a{" "}
					<a
						className="underline"
						href="mailto:braxeldev@gmail.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos"
					>
						braxeldev@gmail.com
					</a>{" "}
					desde la dirección vinculada a tu cuenta.
				</p>
				<p>
					Incluye tu nombre, la dirección de correo de tu cuenta Braxel y, si
					aplica, la página de Facebook o cuenta de Instagram conectada.
					Confirmaremos la solicitud y eliminaremos los datos aplicables, salvo
					los que debamos conservar por obligaciones legales o de seguridad.
				</p>
			</article>
		</main>
	);
}
