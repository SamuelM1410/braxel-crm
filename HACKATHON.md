# Braxel para HackWashU: IA con evidencia y decisión humana

Rama: `hackathon/base-demo`. Braxel es un CRM que ya usa un agente de IA (Eve) para investigar leads. Esta rama agrega la trazabilidad de la decisión humana: quién aprobó o rechazó un lead y por qué.

## Qué muestra la demo

| Punto del jurado | Dónde se ve |
| --- | --- |
| Lead público | Companies → cualquier empresa "(sintético)". Trae solo señales públicas. |
| Investigación de Eve | Panel "Plan comercial del lead": diagnóstico, escenario y plan de implementación. La pestaña Agent permite pedir una evaluación nueva si el agente está configurado. |
| Evidencia | Sección "Evidencia verificable" y "Información que falta confirmar". |
| Puntajes | Evidence, Opportunity y Priority, de 0 a 100. |
| Oferta | Oferta recomendada, rango de precio, apertura sugerida y preguntas de descubrimiento. |
| Decisión humana | Botones Approve lead y Reject lead. El motivo es obligatorio. |
| Historial de quién aprobó y por qué | Bloque "Decisión humana" del panel y pestaña Activity de la empresa. |

## Qué es nuevo y qué ya estaba en producción

Ya estaba en producción: el dossier de Lead OS, los puntajes, la oferta recomendada, el agente Eve, el endpoint de intake y los botones de revisión.

Es nuevo en esta rama:
- El motivo de la decisión es obligatorio en la API y en la interfaz.
- Cada decisión crea una nota en el historial de la empresa, en la misma transacción que la decisión.
- El canal de contacto queda bloqueado hasta que una persona aprueba el lead.
- El bloque "Decisión humana" y el aviso de datos sintéticos en el panel.
- Un modo demo (`HACKATHON_DEMO_MODE`) que no llama a n8n y no abre ninguna ruta pública.
- Un seed con 5 empresas sintéticas y pruebas automáticas para todo lo anterior.

## Fechas

La ventana oficial de HackWashU es del 25 al 27 de septiembre. Confirma con las reglas del evento qué trabajo debe hacerse dentro de esa ventana y declara en el envío que Braxel es un CRM existente. El evento exige que el proyecto sea estudiantil.

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

1. 0:00–0:45 — El problema. Quien prospecta en frío contacta a ciegas o investiga a mano. Braxel investiga con IA y nunca contacta sin aprobación humana.
2. 0:45–2:15 — El dossier. Abre "Panadería Sol y Trigo (sintético)". Señala el aviso de datos sintéticos, los tres puntajes, la evidencia, la oferta y el rango de precio. Di que esto ya corría en producción.
3. 2:15–3:00 — El bloqueo. Señala que el botón "Abrir WhatsApp" está deshabilitado y explica por qué.
4. 3:00–4:15 — La decisión. Pulsa Approve lead. Escribe un motivo corto para mostrar que el botón sigue deshabilitado. Escribe un motivo completo y confirma. Muestra el bloque "Decisión humana" y el botón de contacto desbloqueado. Abre la pestaña Activity y señala la nota con quién y por qué.
5. 4:15–5:00 — Cierre. Rechaza otro lead y muestra que su canal sigue bloqueado. Resume: cada decisión humana queda registrada y consultable.

## Límites conocidos

- La investigación de Eve en vivo necesita la clave del modelo. El seed trae los dossiers ya generados.
- El video debe usar solo las empresas sintéticas.
- La página de impacto y el módulo financiero no están en esta rama.
