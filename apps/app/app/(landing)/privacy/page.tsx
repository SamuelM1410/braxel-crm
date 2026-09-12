import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Política de privacidad",
	description: "Política de privacidad de Braxel.",
};

export default function PrivacyPage() {
	return (
		<main className="min-h-svh bg-background px-6 py-16 text-foreground">
			<article className="mx-auto max-w-3xl space-y-10">
				<header className="space-y-3">
					<p className="text-sm font-medium text-muted-foreground">Braxel</p>
					<h1 className="text-4xl font-semibold tracking-tight">
						Política de privacidad
					</h1>
					<p className="text-sm text-muted-foreground">
						Última actualización: 12 de septiembre de 2026
					</p>
				</header>
				<section className="space-y-3">
					<h2 className="text-xl font-semibold">Información que tratamos</h2>
					<p>
						Tratamos información de cuentas conectadas, empresas, contactos,
						conversaciones, actividades y datos que las personas usuarias
						ingresan al CRM. Cuando autorizas una conexión de Google o Meta,
						tratamos solamente los permisos que autorizas para prestar la
						función solicitada.
					</p>
				</section>
				<section className="space-y-3">
					<h2 className="text-xl font-semibold">Finalidad</h2>
					<p>
						Usamos la información para organizar relaciones comerciales, mostrar
						conversaciones y contactos, preparar recomendaciones comerciales y
						operar las integraciones que la persona usuaria conecte.
					</p>
				</section>
				<section className="space-y-3">
					<h2 className="text-xl font-semibold">Conexiones de terceros</h2>
					<p>
						Las integraciones con Google y Meta se usan para acceder a los datos
						autorizados y ejecutar acciones solicitadas desde Braxel. No
						vendemos datos personales ni usamos mensajes de cuentas conectadas
						para publicidad propia.
					</p>
				</section>
				<section className="space-y-3">
					<h2 className="text-xl font-semibold">Conservación y seguridad</h2>
					<p>
						Conservamos los datos mientras sean necesarios para operar el
						espacio de trabajo o hasta que se solicite su eliminación. Aplicamos
						controles técnicos y de acceso razonables para proteger la
						información.
					</p>
				</section>
				<section className="space-y-3">
					<h2 className="text-xl font-semibold">Tus derechos</h2>
					<p>
						Puedes solicitar acceso, corrección o eliminación de tus datos, y
						revocar conexiones de terceros desde la configuración de tu cuenta.
						Para solicitar eliminación de datos de Meta, visita{" "}
						<a className="underline" href="/data-deletion">
							la página de eliminación de datos
						</a>
						.
					</p>
				</section>
				<section className="space-y-3">
					<h2 className="text-xl font-semibold">Contacto</h2>
					<p>
						Para preguntas de privacidad, escribe a{" "}
						<a className="underline" href="mailto:braxeldev@gmail.com">
							braxeldev@gmail.com
						</a>
						.
					</p>
				</section>
			</article>
		</main>
	);
}
