# Braxel para LUMA: inteligencia de ingresos y sostenibilidad

Rama: `hackathon/revenue-intelligence-demo` (parte de `main`, con las correcciones de la rama base aplicadas encima). Braxel investiga leads con IA y exige una decisión humana antes de contactar. Esta rama agrega una capa financiera que convierte los puntajes del dossier en probabilidad de cierre, valor esperado y punto de equilibrio, en COP o USD, con supuestos que el jurado puede cambiar.

## Qué muestra la demo

| Requisito | Dónde se ve |
| --- | --- |
| Probabilidad de cierre | Panel "Proyección financiera del lead", dentro de cada empresa. |
| Valor esperado | El mismo panel y la página Finance. |
| Costo por contacto | Campo editable en el panel y en Finance. |
| Punto de equilibrio | Por contacto (P*), en el panel. Del portafolio, en Finance: leads necesarios para cubrir el costo mensual de la plataforma. |
| Escenarios en COP | Finance → "Escenarios en COP": conservador, base y optimista. |
| Ajuste manual de precio y costo | Moneda COP/USD, valor de cierre, costo por contacto, costo de la plataforma y tasa COP por USD. Todo se recalcula al escribir. |
| Explicación matemática verificable | "Cálculo paso a paso" en el panel, con los números sustituidos. En Finance, las fórmulas y una tabla por lead que se puede recalcular a mano. |
| Encontrar la ruta sin conocer la URL | Finance aparece en el menú lateral. |

## El modelo

- Probabilidad de cierre: P = 0,6 × (oportunidad ÷ 100) + 0,4 × (prioridad ÷ 100).
- Valor esperado: VE = P × V − C. V es el valor de cierre y C el costo por contacto.
- Probabilidad de equilibrio de un contacto: P* = C ÷ V.
- Leads para equilibrio: redondeo hacia arriba de (costo mensual de la plataforma ÷ VE promedio).
- Escenarios: multiplican P (con tope de 100 %) y V. El costo por contacto no cambia.

Ejemplo con los valores iniciales (oportunidad 74, prioridad 88, V = COP 3.000.000, C = COP 25.000): P = 0,796 y VE = COP 2.363.000. En USD con tasa 4.000: VE = USD 590,75.

La lógica está en `packages/validation/src/lead-finance.ts` y tiene pruebas en `packages/validation/test/lead-finance.spec.ts`. La API solo entrega los puntajes guardados; no calcula nada.

## Lo que la demo no afirma

- La probabilidad es una heurística sobre los puntajes. No está calibrada con cierres reales.
- Los valores iniciales (COP 3.000.000 de cierre, COP 25.000 por contacto, COP 1.000.000 al mes de plataforma y 4.000 COP por USD) son supuestos de partida. Cámbialos por las cifras reales de Braxel antes de grabar. Con estos valores el punto de equilibrio sale en 1 lead, porque el costo de plataforma inicial es bajo.
- La tasa COP por USD es editable y no se consulta en vivo.
- El punto de equilibrio compara los leads con dossier que hay hoy con los necesarios por mes.

## Fechas

LUMA termina el 28 de septiembre y es en línea. El evento exige que el proyecto sea estudiantil. Declara en el envío que Braxel es un CRM existente.

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

1. 0:00–0:40 — El problema: prospectar sin saber si el negocio es rentable.
2. 0:40–1:30 — Abre "Panadería Sol y Trigo (sintético)". Muestra puntajes, evidencia y oferta. Di que esto ya corría en producción.
3. 1:30–2:45 — Baja a la proyección financiera. Lee la probabilidad (79,6 %) y el valor esperado. Cambia el valor de cierre y el costo por contacto. Cambia a USD y muestra que el valor esperado se recalcula. Lee el "Cálculo paso a paso".
4. 2:45–3:30 — Aprueba el lead con un motivo completo y muestra la nota en Activity.
5. 3:30–4:30 — Abre Finance desde el menú lateral. Muestra los escenarios en COP, el punto de equilibrio y la tabla por lead. Recalcula una fila a mano frente a la cámara.
6. 4:30–5:00 — Cierre: una fórmula, no una caja negra, y supuestos que cualquiera puede cambiar. Nombra que la probabilidad es una heurística.

## Límites conocidos

- La investigación de Eve en vivo necesita la clave del modelo. El seed trae los dossiers ya generados.
- Los supuestos se guardan en el navegador (localStorage). Otro navegador arranca con los valores iniciales.
- La página de impacto de InfinityX no está en esta rama.
