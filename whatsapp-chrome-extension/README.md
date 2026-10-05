# Braxel WhatsApp Sender

Extensión local de Chrome para el botón **Enviar por WhatsApp** del CRM.

## Instalación local

1. Abre `chrome://extensions` en Chrome.
2. Activa **Developer mode**.
3. Pulsa **Load unpacked**.
4. Selecciona esta carpeta: `whatsapp-chrome-extension/`.
5. Mantén abierta una sesión autenticada en `https://web.whatsapp.com`.

El CRM abre una URL con `braxel_auto_send=1` solo cuando se pulsa el botón
**Enviar por WhatsApp**. La extensión espera a que cargue el chat y pulsa el
botón de envío. No inicia envíos en otras páginas ni en otras navegaciones.

## Limitación importante

Los selectores internos de WhatsApp Web pueden cambiar. Si WhatsApp modifica
el botón de envío, hay que actualizar `content.js`; el CRM seguirá pudiendo
abrir el chat y dejar el mensaje preparado.
