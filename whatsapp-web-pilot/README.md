# Piloto local de WhatsApp Web

Este proceso solo recibe mensajes de chats individuales, los reenvía al CRM y
guarda el borrador de Eve para aprobación humana. No procesa grupos, no inicia
conversaciones, no hace campañas y no envía automáticamente.

```bash
bun install
set -a; . ../.env; set +a
export CRM_REPLY_SECRET="$CRM_INTAKE_SECRET"
npm start
```

La primera ejecución muestra un QR; las siguientes reutilizan la sesión en
`.wwebjs_auth/`. Comprueba `http://localhost:8787/health`. El API debe estar en
`http://localhost:3001` y recibe el evento en
`/api/whatsapp-web/inbound`. Mantén `AUTO_REPLY_ENABLED=false` hasta aprobar
manualmente los borradores.
