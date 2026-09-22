# Braxel para InfinityX: impacto, escala y contacto solo con autorización

Rama: `hackathon/infinityx-impact` (parte de `hackathon/base-demo`). Braxel investiga leads con un agente de IA y exige una decisión humana con motivo antes de habilitar cualquier contacto. Esta rama agrega la página **Impact**, visible en el menú lateral, que mide ese proceso.

## Qué muestra la demo

La página Impact (menú lateral → Impact) tiene cinco bloques:

| Requisito | Bloque de la página |
| --- | --- |
| Métrica de leads revisados | "Leads revisados": cuántos leads tienen decisión humana sobre el total. Los datos salen de la base. |
| Tiempo ahorrado | "Tiempo ahorrado (estimado)": leads × (45 − 5) minutos. Los minutos son supuestos configurables en `apps/api/src/lead-impact/lead-impact.config.ts`. La página los marca como supuesto. |
| Riesgo reducido por la revisión humana | "Contactos bloqueados", "Leads descartados" y "decisiones con motivo e historial". |
| Arquitectura de escalabilidad | Cinco pasos, del intake al contacto autorizado, con "Por qué escala" y "Límites conocidos". |
| Demo de múltiples empresas | Tabla con las 5 empresas sintéticas: puntajes, decisión, motivo y estado del canal. |
| Cómo se evita contactar sin autorización | Lista de 5 garantías. Cada una corresponde a código de esta rama. |

## Qué es nuevo y qué ya estaba en producción

Ya estaba en producción: el dossier, los puntajes, Eve, la cola `AgentTask` y los botones de revisión.

Es nuevo en esta rama (además de lo de `hackathon/base-demo`):
- El módulo `lead-impact` de la API y la página Impact.
- El motivo obligatorio, el historial de decisiones y el bloqueo del canal de contacto (heredados de la rama base).

## Lo que la demo no afirma

- Los minutos ahorrados son una estimación con supuestos, no una medición.
- Braxel es una instalación de una sola organización. Las "varias empresas" de la demo son prospectos, no clientes separados.
- Toda la carga comparte una base Postgres. La capacidad de revisión la limita el equipo humano.

## Fechas

InfinityX termina el 25 de septiembre. El evento exige que el proyecto sea estudiantil. Declara en el envío que Braxel es un CRM existente.

## Cómo correrlo en la máquina que ya tiene el CRM local

Requisitos: Bun 1.3.12, Node 22 o superior y Postgres local. Usa una base local. Nunca apuntes esta demo a la base de producción: el seed se niega a correr contra una base remota.

1. Descomprime el ZIP en una carpeta nueva. No lo copies encima del repositorio que ya tienes.
2. Copia el `.env` de tu CRM local a la raíz de la carpeta nueva. Confirma que `DATABASE_URL` usa `?schema=braxel`, porque el cliente de Prisma lee ese esquema.
3. Agrega estas líneas al `.env`:

   ```
   HACKATHON_DEMO_MODE="true"
   ```

   Con esto aprobar o rechazar un lead no llama a n8n. La API ignora esta variable si `NODE_ENV` o `VERCEL_ENV` es `production`.
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
6. Si el CRM te pide completar el onboarding, ponle nombre y sitio al espacio de trabajo. Si pide la clave de investigación, ingrésala: el CRM la exige antes de mostrar las páginas.

Antes de entregar o grabar, verifica:

```bash
bun run check-types
bun run lint
bun run test
bun run build
```

`bun run test` necesita `TEST_DATABASE_URL` (base que termine en `_test`; `bun run db:test` la crea). En `main` fallan 5 pruebas de `apps/app` que ya fallaban antes de estos cambios (puerta de la clave de investigación, proxy y textos de herramientas). Con estos cambios fallan las mismas 5 y ninguna más.

## Datos sintéticos y seguridad de contacto

- Las 5 empresas del seed son ficticias. Sus dominios y enlaces usan `.invalid`, un dominio reservado que no resuelve. Su teléfono es `+57 000 000 0000`. Ningún enlace puede llegar a una persona real.
- Los leads pendientes quedan en `REVIEW_REQUIRED`, `PENDING` y `No contactar: sí`.
- El botón de abrir el canal de contacto está deshabilitado hasta que una persona aprueba el lead. Aprobar o rechazar exige un motivo de al menos 10 caracteres, en la interfaz y en la API.
- Cada decisión queda como nota en el historial de la empresa, con quién decidió y por qué.
- No existe ningún endpoint público de demo. El modo demo solo omite la llamada saliente a Lead OS.

## Guion del video (5 minutos)

1. 0:00–0:40 — El problema y la promesa: escalar la prospección sin contactar a nadie sin permiso.
2. 0:40–1:40 — Abre Companies. Muestra las 5 empresas sintéticas con su estado de revisión y puntajes.
3. 1:40–2:40 — Abre una empresa pendiente. Muestra el bloqueo del canal. Aprueba con un motivo completo y muestra el bloque "Decisión humana".
4. 2:40–4:00 — Abre Impact. Recorre leads revisados, tiempo ahorrado (di que es una estimación), contactos bloqueados y leads descartados.
5. 4:00–4:40 — Baja a "Cómo se evita contactar sin autorización" y a "Arquitectura y escalabilidad". Nombra los límites.
6. 4:40–5:00 — Cierre: la escala viene de la cola y del agente; la confianza viene de la decisión humana registrada.

## Límites conocidos

- La investigación de Eve en vivo necesita la clave del modelo. El seed trae los dossiers ya generados.
- La tabla de Impact muestra los 50 leads más recientes.
- El módulo financiero de LUMA no está en esta rama.
