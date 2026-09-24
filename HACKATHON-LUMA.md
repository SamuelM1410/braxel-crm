# Braxel para LUMA: inteligencia de ingresos verificable

Base unificada sobre el `main` de GitHub (commit `07652e0`, con las correcciones de Meta e Instagram de Samuel). Un solo código con todo: revisión humana, impacto e inteligencia de ingresos. Los tres paquetes de esta entrega son el mismo código; cambia solo `HACKATHON.md`, y los tres documentos están en la raíz (`HACKATHON.md`, `HACKATHON-INFINITYX.md`, `HACKATHON-LUMA.md`).

Braxel es un CRM en producción que investiga leads con IA y exige una decisión humana antes de contactar. Para el hackatón añadimos la capa que convierte los puntajes del dossier en dinero: probabilidad de cierre, valor esperado y punto de equilibrio, en COP o USD, con supuestos que el jurado puede cambiar en pantalla y una fórmula que puede recalcular a mano.

## Qué muestra la demo, punto por punto

| Lo que pide el jurado | Dónde se ve |
| --- | --- |
| Probabilidad de cierre | Panel "Proyección financiera del lead", dentro de cada empresa. |
| Valor esperado | El mismo panel, y la página Finance para el portafolio. |
| Coste por contacto | Campo editable en el panel y en Finance. |
| Punto de equilibrio | Por contacto (P*) en el panel. Del portafolio en Finance: leads necesarios para cubrir el costo mensual. |
| Escenarios en COP | Finance → "Escenarios en COP": conservador, base y optimista. |
| Ajuste manual de precio y coste | Moneda COP/USD, valor de cierre, costo por contacto, costo de plataforma y tasa COP por USD. Todo recalcula al escribir. |
| Explicación matemática verificable | "Cálculo paso a paso" en el panel, con los números sustituidos, y en Finance las fórmulas más una tabla por lead. |
| Encontrar la ruta sin conocer la URL | **Finance** está en el menú lateral, igual que Impact. |

## El modelo, completo

- Probabilidad de cierre: **P = 0,6 × (oportunidad ÷ 100) + 0,4 × (prioridad ÷ 100)**
- Valor esperado por lead: **VE = P × V − C**, donde V es el valor de cierre y C el costo por contacto.
- Probabilidad de equilibrio de un contacto: **P\* = C ÷ V**. Si P supera P\*, el contacto se paga solo en valor esperado.
- Leads para equilibrio: **techo(costo mensual de plataforma ÷ VE promedio)**.
- Escenarios: multiplican P (con tope de 100 %) y V. El costo por contacto no cambia.
- **Un lead rechazado no suma.** Nunca se va a contactar, así que su valor esperado es 0. Aparece en la tabla con "No suma: rechazado" y queda fuera de los totales, los escenarios y el punto de equilibrio.

Ejemplo verificable con los valores iniciales (oportunidad 74, prioridad 88, V = COP 3.000.000, C = COP 25.000):

- P = 0,6 × 0,74 + 0,4 × 0,88 = **0,796**
- VE = 0,796 × 3.000.000 − 25.000 = **COP 2.363.000**
- P\* = 25.000 ÷ 3.000.000 = **0,83 %**
- En USD con tasa 4.000: VE = **USD 590,75**, que es 2.363.000 ÷ 4.000.

La lógica vive en `packages/validation/src/lead-finance.ts` como funciones puras, con 34 pruebas en `packages/validation/test/lead-finance.spec.ts` que comprueban la aritmética, la conversión de moneda, los topes y los casos límite (valor de cierre cero, portafolio vacío, leads que pierden dinero). La API solo entrega los puntajes guardados: no calcula nada, así que el cálculo es el mismo en la ficha y en el portafolio.

## Cambia los supuestos antes de grabar

Los valores iniciales son supuestos de partida, no las cifras de Braxel:

| Supuesto | Valor inicial | Dónde cambiarlo |
| --- | --- | --- |
| Valor de cierre | COP 3.000.000 | En pantalla, o `packages/validation/src/lead-finance.ts` |
| Costo por contacto | COP 25.000 | En pantalla |
| Costo mensual de plataforma | COP 1.000.000 | En pantalla, en Finance |
| Tasa COP por USD | 4.000 | En pantalla |

Con esos valores el punto de equilibrio sale en **1 lead**, porque el costo de plataforma inicial es bajo frente al valor esperado. Pon las cifras reales de Braxel: el número cambiará y la demo será más creíble. Los valores editados se guardan en el navegador y se usan tanto en la ficha del lead como en el portafolio.

## Qué es nuevo y qué ya estaba en producción

Ya estaba en producción: el dossier, los puntajes, la oferta recomendada, Eve y los botones de revisión.

Es nuevo en esta entrega:

1. **El modelo financiero completo** en COP y USD, con supuestos editables y fórmula visible.
2. **La página Finance** en el menú lateral, con escenarios y punto de equilibrio del portafolio.
3. **La página Impact**, que mide el proceso de revisión.
4. **El motivo obligatorio**, el historial de cada decisión y el bloqueo del canal de contacto.
5. **Rechazo de enlaces que el navegador ejecutaría**, que llegaban desde páginas web.
6. **Un límite de confianza explícito para el agente.**
7. **Una prueba de extremo a extremo** del recorrido completo.
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

Corrido en local con Postgres:

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

1. **0:00–0:40 — El problema.** Prospectar sin saber si el negocio es rentable.
2. **0:40–1:20 — El lead.** Abre "Panadería Sol y Trigo (sintético)". Puntajes, evidencia y oferta. Di que esto ya corría en producción.
3. **1:20–2:50 — La proyección.** Baja a "Proyección financiera". Lee la probabilidad (79,6 %) y el valor esperado. Cambia el valor de cierre y el costo por contacto en vivo. Cambia a USD y muestra que el valor esperado se convierte con la tasa. Lee el "Cálculo paso a paso" y señala P\*.
4. **2:50–3:30 — La decisión.** Aprueba el lead con un motivo completo. Muestra la nota en Activity y el canal desbloqueado.
5. **3:30–4:30 — El portafolio.** Abre Finance desde el menú. Escenarios en COP, punto de equilibrio y la tabla por lead. **Recalcula una fila a mano frente a la cámara**: es el momento más fuerte del video.
6. **4:30–5:00 — Cierre.** Una fórmula, no una caja negra, y supuestos que cualquiera puede cambiar. Di en voz alta que la probabilidad es una heurística sin calibrar.

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
