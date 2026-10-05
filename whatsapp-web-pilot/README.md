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
API. Tras enviar una respuesta, el piloto registra el mensaje real en
`/api/whatsapp-web/outbound`, lo que alimenta las métricas comerciales y evita
contar un borrador como respuesta entregada. Define `CRM_OUTBOUND_URL` solo si
la ruta derivada por defecto no es correcta. El CRM conserva la revisión
humana para respuestas sensibles. El piloto transcribe mensajes de audio cuando
`OPENAI_API_KEY` está disponible. El estado `audioTranscriptionConfigured` lo
confirma sin exponer la clave.

Si WhatsApp aparece conectado pero Eve no responde, revisa en `/health`
`replyReady` y `replyDisabledReason`. Las causas habituales son que falte
`CRM_REPLY_URL` o `CRM_REPLY_SECRET`, que `AUTO_REPLY_ENABLED=false`, que
`WHATSAPP_INBOUND_ONLY=true`, que el API no tenga
`WHATSAPP_AUTO_REPLY_MODE=smart`, o que la respuesta haya quedado en revisión
humana por ser sensible, ambigua, una solicitud de precio o una petición de
llamada. En esos casos no es una desconexión de la sesión: es una decisión de
seguridad del flujo.
