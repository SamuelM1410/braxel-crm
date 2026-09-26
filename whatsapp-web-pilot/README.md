# Piloto local de WhatsApp Web

Este proceso solo recibe mensajes de chats individuales, los reenvía al CRM y
guarda el resultado de Eve. Envía solo respuestas de bajo riesgo cuando el CRM
devuelve una decisión smart. Detiene respuestas sensibles o ambiguas para revisión
humana. No procesa grupos, no inicia conversaciones y no hace campañas.

```bash
bun install
set -a; . ../.env; set +a
export CRM_REPLY_SECRET="$CRM_INTAKE_SECRET"
npm start
```

La primera ejecución muestra un QR; las siguientes reutilizan la sesión en
`.wwebjs_auth/`. Comprueba `http://localhost:8787/health`. El API debe estar en
`http://localhost:3001` y recibe el evento en
`/api/whatsapp-web/inbound`. Usa `AUTO_REPLY_ENABLED=true` y
`WHATSAPP_INBOUND_ONLY=false` solo con `WHATSAPP_AUTO_REPLY_MODE=smart` en el
API. El CRM conserva la revisión humana para respuestas sensibles.
