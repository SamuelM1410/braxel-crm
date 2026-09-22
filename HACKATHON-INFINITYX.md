# Braxel para InfinityX: impacto medido, escala real y contacto solo con autorización

Base unificada sobre el `main` de GitHub (commit `07652e0`, con las correcciones de Meta e Instagram de Samuel). Un solo código con todo: revisión humana, impacto e inteligencia de ingresos. Los tres paquetes de esta entrega son el mismo código; cambia solo `HACKATHON.md`, y los tres documentos están en la raíz (`HACKATHON.md`, `HACKATHON-INFINITYX.md`, `HACKATHON-LUMA.md`).

Braxel es un CRM en producción que investiga leads con un agente de IA y exige una decisión humana con motivo antes de habilitar cualquier contacto. Para el hackatón añadimos la página **Impact**, en el menú lateral, que mide ese proceso en vez de suponerlo.

## Qué muestra la demo, punto por punto

Menú lateral → **Impact**:

| Lo que pide el jurado | Dónde se ve |
| --- | --- |
| Métrica de leads revisados | "Leads revisados": cuántos tienen decisión humana sobre el total, con el porcentaje y cuántos esperan. Sale de la base. |
| Tiempo ahorrado | Bloque "Estimado a partir de supuestos", con los minutos por lead marcados como supuesto y la mediana real medida al lado para comparar. |
| Riesgo reducido por la revisión humana | "Contactos bloqueados", "Leads descartados" y el porcentaje de decisiones con motivo e historial. |
| Arquitectura de escalabilidad | Cinco pasos, del intake al contacto autorizado, con "Por qué escala" y "Límites conocidos". |
| Demo de múltiples empresas | Tabla con las 5 empresas: puntajes, decisión, quién decidió, motivo y estado del canal. |
| Cómo se evita contactar sin autorización | Cinco garantías, cada una correspondiente a código de esta rama. |

## Medido, no supuesto

Este es el cambio importante de esta entrega. La página separa dos bloques:

**Medido** (sale de las filas de la base):
- Cuántas decisiones existen y quién las tomó.
- La mediana, la más rápida y la más lenta, desde que el lead entró al CRM hasta que una persona decidió.
- Cuántos leads traen evidencia y cuántas afirmaciones con fuente hay.
- Cuántas decisiones explican por qué.

**Estimado a partir de supuestos** (no está medido, y la página lo dice):
- El tiempo ahorrado, con los minutos por lead configurables en `apps/api/src/lead-impact/lead-impact.config.ts`. Solo cuenta los leads que ya pasaron por una persona, porque un lead sin revisar no ahorró tiempo a nadie.

La página imprime la mediana medida junto al supuesto de revisión, para que el jurado compare los dos números en pantalla.

## Por qué escala

1. **Ingesta y investigación están desacopladas.** La API escribe una fila `AgentTask` en Postgres y no espera a la IA.
2. **La cola es una tabla**, y las tareas se reclaman con `FOR UPDATE SKIP LOCKED`, así que varios trabajadores no duplican trabajo.
3. **Tres despliegues independientes** (app, API y agente) sobre una base compartida.
4. **El costo humano por lead es la revisión, no la investigación**, y eso es justo lo que la página mide.

## Qué es nuevo y qué ya estaba en producción

Ya estaba en producción: el dossier, los puntajes, Eve, la cola `AgentTask` y los botones de revisión.

Es nuevo en esta entrega:

1. **La página Impact** y su módulo `lead-impact` en la API, con métricas medidas.
2. **El motivo obligatorio** de cada decisión, en la API y en la interfaz.
3. **El historial** de cada decisión, en la misma transacción que la decisión.
4. **El bloqueo del canal de contacto** hasta que una persona aprueba.
5. **Rechazo de enlaces que el navegador ejecutaría** (`javascript:`, `data:`, `file:`), que llegaban desde páginas web y se renderizaban tal cual en tres sitios.
6. **Un límite de confianza explícito para el agente**: el contenido que lee es evidencia, no una orden.
7. **Una prueba de extremo a extremo** del recorrido completo: `apps/api/test/lead-lifecycle.e2e.spec.ts`.
8. **La suite en verde**: 1117 pruebas, 0 fallas.

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

1. **0:00–0:40 — El problema.** Escalar la prospección sin contactar a nadie sin permiso.
2. **0:40–1:30 — El lead y su bloqueo.** Abre una empresa pendiente. Muestra evidencia y puntajes, y que el canal está bloqueado.
3. **1:30–2:20 — La decisión.** Aprueba con un motivo completo. Muestra el bloque "Decisión humana" y la nota en Activity.
4. **2:20–3:40 — Impact.** Abre Impact. Recorre "Leads revisados", y detente en "Medido, no supuesto": decisiones reales, quién decidió, la mediana real y la evidencia contada. Luego muestra el bloque "Estimado" y di en voz alta que eso es un supuesto, no una medición.
5. **3:40–4:30 — Escala y garantías.** Baja a "Cómo se evita contactar sin autorización" y a "Arquitectura y escalabilidad". Lee dos límites conocidos en voz alta.
6. **4:30–5:00 — Cierre.** La escala viene de la cola y del agente; la confianza viene de la decisión humana registrada y medida.

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
