# Braxel para HackWashU: IA con evidencia y decisión humana trazable

Base unificada sobre el `main` de GitHub (commit `07652e0`, con las correcciones de Meta e Instagram de Samuel). Un solo código con todo: revisión humana, impacto e inteligencia de ingresos. Los tres paquetes de esta entrega son el mismo código; cambia solo `HACKATHON.md`, y los tres documentos están en la raíz (`HACKATHON.md`, `HACKATHON-INFINITYX.md`, `HACKATHON-LUMA.md`).

Braxel es un CRM en producción que usa un agente de IA (Eve) para investigar leads antes de contactarlos. Para el hackatón cerramos el hueco que le faltaba: **ninguna decisión humana quedaba registrada, y nada impedía abrir el canal de contacto de un lead sin aprobar.**

## Qué muestra la demo, punto por punto

| Lo que pide el jurado | Dónde se ve |
| --- | --- |
| Lead público | Companies → cualquier empresa "(sintético)". Solo señales públicas. |
| Investigación de Eve | Panel "Plan comercial del lead": diagnóstico, escenario, plan y canal recomendado. |
| Evidencia | "9. Evidencia verificable", con fuente y fuerza por afirmación, y "7. Información que falta confirmar". |
| Puntajes | Evidence, Opportunity y Priority, de 0 a 100, con su fuente en el dossier. |
| Oferta | Oferta recomendada, rango de precio, apertura sugerida, preguntas y objeciones. |
| Decisión humana | Botones Approve lead y Reject lead. El motivo es obligatorio: con menos de 10 caracteres el botón sigue deshabilitado. |
| Historial de quién aprobó y por qué | Bloque "Decisión humana" en el panel, y la nota en la pestaña Activity con el nombre, la hora y el motivo. |

El recorrido completo (lead → investigación → bloqueo → aprobación → contacto autorizado → historial) está cubierto por una prueba automática: `apps/api/test/lead-lifecycle.e2e.spec.ts`.

## Qué es nuevo y qué ya estaba en producción

Ya estaba en producción: el dossier de Lead OS, los puntajes, la oferta recomendada, el agente Eve, el endpoint de intake y los botones de revisión.

Es nuevo en esta entrega:

1. **El motivo de la decisión es obligatorio**, en la API, en el servicio y en el diálogo.
2. **Cada decisión crea una nota en el historial** de la empresa, en la misma transacción que la decisión, así que no puede haber una sin la otra.
3. **El canal de contacto queda bloqueado** hasta que una persona aprueba el lead, y un lead rechazado queda en No contactar.
4. **Un enlace que el navegador ejecutaría se rechaza.** `z.string().url()` acepta `javascript:` y `data:`, y la evidencia del dossier sale de páginas web que cualquiera puede editar. Tres sitios renderizaban esos enlaces tal cual.
5. **El agente sabe qué es una página web**: sus instrucciones ahora dicen que el contenido que lee es evidencia, no una orden, y que ninguna página puede aprobar un lead ni levantar un No contactar.
6. **Un modo demo** (`HACKATHON_DEMO_MODE`) que no llama a n8n y no abre ninguna ruta pública.
7. **Datos sintéticos seguros**: 5 empresas en el dominio reservado `.invalid`, con aviso visible en la ficha.
8. **La suite quedó en verde**: 1117 pruebas, 0 fallas, incluidas las cinco que antes fallaban.

## Por qué esto y no un CRM nuevo

La narrativa no es "construimos un CRM en 48 horas". Es que Braxel ya resuelve la parte difícil —investigar con evidencia antes de contactar— y en el hackatón cerramos la pregunta que un jurado siempre hace: **¿quién es responsable si algo sale mal?** La respuesta está en el historial de la empresa: quién aprobó, cuándo y por qué. Y si nadie aprobó, el canal está cerrado.

## Cómo correrlo en la máquina que ya tiene el CRM local

Los tres paquetes de esta entrega son **la misma base unificada**. Solo cambia este documento. Descomprime uno cualquiera; no hace falta combinar nada.

Requisitos: Bun 1.3.12, Node 22 o superior y Postgres local. Usa una base local. Nunca apuntes esta demo a la base de producción: el seed se niega a correr contra una base remota.

1. Descomprime el ZIP en una carpeta nueva. No lo copies encima del repositorio que ya tienes.
2. Copia el `.env` de tu CRM local a la raíz de la carpeta nueva. Confirma que `DATABASE_URL` usa `?schema=braxel`, porque el cliente de Prisma lee ese esquema.
3. Agrega esta línea al `.env`:

   ```
   HACKATHON_DEMO_MODE="true"
   ```

   Con esto, aprobar o rechazar un lead no llama a n8n. La decisión, el revisor y el motivo se guardan igual. La API ignora esta variable si `NODE_ENV` o `VERCEL_ENV` es `production`.
4. Instala, genera Prisma, migra y carga los datos sintéticos:

   ```bash
   bun install
   bun run db:generate
   bun run db:migrate
   bun run db:seed:hackathon
   ```

   El seed se puede repetir: deja los leads en su estado inicial.
5. Arranca la aplicación:

   ```bash
   bun run dev
   ```

   La app queda en `http://localhost:3000`. Inicia sesión como siempre con Google. Si no tienes Google configurado, `bun run --filter=api dev:session` imprime una cookie de sesión local.
6. Si el CRM pide completar el onboarding, ponle nombre y sitio al espacio de trabajo. **No pide la clave de investigación**: el CRM entra sin ella. Sin clave, Eve no investiga en vivo, pero el seed ya trae los dossiers y la demo funciona completa. La clave se pone después en Settings → General.

Antes de entregar o grabar, verifica:

```bash
bun run check-types
bun run lint
bun run test
bun run build
```

`bun run test` necesita `TEST_DATABASE_URL` (una base que termine en `_test`; `bun run db:test` la crea).

## Estado de la validación

Corrido en esta máquina, sobre esta rama, con Postgres local:

| Comprobación | Resultado |
| --- | --- |
| `bun run check-types` | 13 de 13 tareas |
| `bun run lint` | 9 de 9 tareas |
| `bun run test` | **1117 pruebas, 0 fallas** |
| `bun run build` | 4 de 4 tareas |

Las cinco pruebas que los paquetes anteriores reportaban como fallando ya no fallan. Cuatro describían una página que Braxel retiró y se eliminaron con su motivo escrito en `docs/api.md`; la quinta era un defecto real y está corregida. El detalle está en la sección de límites.

Además se instaló desde cero (`bun install --frozen-lockfile`) en una carpeta limpia extraída del propio ZIP, y ahí también pasan tipos y build.

## Datos sintéticos y seguridad de contacto

- Las 5 empresas del seed son ficticias. Sus dominios y enlaces usan `.invalid`, un dominio reservado que no resuelve. Su teléfono es `+57 000 000 0000`. Ningún enlace puede llegar a una persona real.
- Los leads pendientes quedan en `REVIEW_REQUIRED`, `PENDING` y `No contactar: sí`.
- El botón de abrir el canal de contacto está deshabilitado hasta que una persona aprueba el lead. Aprobar o rechazar exige un motivo de al menos 10 caracteres, validado en la interfaz y en la API.
- Cada decisión queda como nota en el historial de la empresa, con quién decidió y por qué.
- No existe ningún endpoint público de demo. El modo demo solo omite la llamada saliente a Lead OS.
- Un enlace que un navegador ejecutaría (`javascript:`, `data:`, `file:`) se rechaza al entrar y no se renderiza como enlace. La evidencia del dossier viene de páginas web, así que esto importa.

## Guion del video (5 minutos)

1. **0:00–0:45 — El problema.** Quien prospecta en frío contacta a ciegas o investiga a mano. Braxel investiga con IA y nunca contacta sin aprobación humana.
2. **0:45–2:00 — El dossier.** Abre "Panadería Sol y Trigo (sintético)". Señala el aviso de datos sintéticos, los tres puntajes, la evidencia con fuente y la oferta. Di que esto ya corría en producción.
3. **2:00–2:40 — El bloqueo.** Señala que "Abrir WhatsApp" está deshabilitado y lee el motivo en pantalla: nadie puede contactar hasta que una persona apruebe.
4. **2:40–4:00 — La decisión.** Pulsa Approve lead. Escribe un motivo corto y muestra que el botón sigue deshabilitado y el texto dice cuántos caracteres faltan. Completa el motivo y confirma. Muestra el bloque "Decisión humana" con tu nombre y el canal ya desbloqueado. Abre Activity y señala la nota.
5. **4:00–4:40 — La otra mitad.** Abre "Gimnasio Fuerza Andina (sintético)", rechazado: su canal sigue bloqueado y el motivo explica por qué se descartó antes de contactar.
6. **4:40–5:00 — Cierre.** Cada decisión humana queda registrada y consultable, y sin decisión no hay contacto. Nombra el repositorio y el equipo.

## Lo que esta demo no afirma

Estos son los límites reales. Decirlos en la presentación es más fuerte que esconderlos.

1. **Las 5 empresas son datos sintéticos.** No hay clientes reales en la demo, y ningún enlace puede contactar a nadie.
2. **La probabilidad de cierre es una heurística**, no un modelo entrenado: 60 % del puntaje de oportunidad más 40 % del de prioridad. No está calibrada con cierres históricos, porque el CRM todavía no guarda resultados de cierre.
3. **Los minutos ahorrados son un supuesto configurable**, no una medición. La página de impacto los separa en un bloque titulado "Estimado a partir de supuestos" y muestra al lado la mediana real medida.
4. **El tiempo de decisión medido incluye la espera**, no solo el trabajo de la persona. Mide desde que el lead entró al CRM hasta que alguien decidió.
5. **Eve no investiga en vivo sin la clave del modelo.** El seed trae los dossiers ya generados. La demo no depende del agente.
6. **El envío real por Meta e Instagram no está demostrado en esta entrega.** El código de envío y verificación existe (commits de Samuel del 21 de septiembre, con sus pruebas), pero no se probó contra Meta con credenciales reales, y la demo usa solo datos sintéticos. WhatsApp no está resuelto y no lo afirmamos.
7. **Es una instalación de una sola organización.** Las "varias empresas" de la demo son prospectos, no clientes separados con datos aislados.
8. **Toda la carga comparte una base Postgres**, y la capacidad de revisión la limita el equipo humano.
9. **No hay despliegue de staging en esta entrega.** Todo se verificó en local; montar staging necesita credenciales de Vercel y de una base gestionada.
10. **Braxel es un CRM que ya estaba en producción antes del hackatón.** Lo nuevo es lo que lista la sección "Qué es nuevo". Decláralo en el envío, y confirma las reglas del evento sobre proyectos existentes y sobre la condición de estudiante.

## Sobre las cinco pruebas que antes fallaban

Los paquetes anteriores reportaban cinco pruebas fallando. Ya no fallan, y esta es la razón, porque el motivo importa:

- **Cuatro describían una puerta que Braxel retiró.** El CRM original pedía la clave de investigación en `/onboarding/research` antes de dejar entrar. Este fork reemplazó esa página por una redirección a la aplicación. Restaurar la puerta en el proxy produce un bucle de redirecciones: la página manda a `/`, y el proxy manda `/` de vuelta a la página. Lo comprobé en la aplicación corriendo. Las cuatro pruebas se eliminaron junto con el ayudante que quedó sin uso, y el motivo quedó escrito en `docs/api.md`, que hasta ahora describía una puerta inexistente. El formulario original sigue en el repositorio, sin ruta, por si algún día se quiere volver a activar.
- **La quinta era un defecto real.** Seis herramientas que el agente ya trae no tenían frase en español ni inglés, entre ellas las que preparan borradores de Meta, WhatsApp y Gmail. La pestaña Agent mostraba el nombre técnico de cada una. Ya tienen su frase.
