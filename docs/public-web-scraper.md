# Scraper local sin Mindcase

`scripts/public-web-intake.mjs` es el reemplazo local para enriquecer empresas
que ya vienen de Google Maps u otra fuente permitida. No necesita una API de
Mindcase ni Docker: visita únicamente el sitio público de cada empresa,
respeta un `robots.txt` básico, limita el número de páginas y guarda evidencia
por URL y fecha.

Extrae:

- emails públicos;
- teléfonos publicados;
- enlaces públicos de WhatsApp;
- enlaces de Instagram, Facebook, TikTok y LinkedIn;
- evidencia y confianza por hallazgo.

Todos los candidatos entran como `REVIEW_REQUIRED`, `PENDING` y
`doNotContact: true`. El script nunca envía mensajes.

## Uso

El archivo de entrada puede ser el JSON de `scripts/google-maps-discovery.mjs`
o un CSV con una columna `websiteUrl` (también acepta `website` o `url`) y,
opcionalmente, `companyName`, `city` y `sourceUrl`.

```bash
node scripts/public-web-intake.mjs \
  --input=outputs/maps-leads.json \
  --max=50 \
  --max-pages=8
```

El comando anterior es una vista previa. Para importar al CRM hay que definir
`CRM_INTAKE_URL` y `CRM_INTAKE_SECRET` solo en el entorno y añadir `--commit`:

```bash
CRM_INTAKE_URL='https://braxel-api.vercel.app/api/intake/lead-os' \
CRM_INTAKE_SECRET='...' \
node scripts/public-web-intake.mjs --input=outputs/maps-leads.json --commit
```

La integración de email no depende de este scraper: Gmail ya sincroniza
respuestas entrantes y Eve solo puede preparar/enviar una respuesta después de
un primer mensaje humano, con permisos Gmail, etapa comercial apta y aprobación
de la empresa. Las solicitudes de precio, baja, queja, legal o contenido
ambiguo se derivan a revisión humana.
