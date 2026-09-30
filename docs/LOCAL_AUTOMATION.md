# Braxel local automation

## WhatsApp Web pilot

The WhatsApp Web pilot is a browser session, not a hosted WhatsApp Cloud API
connection. The computer that owns the linked session must stay powered on,
awake, connected to the internet, and running both processes:

```bash
# CRM API (from braxel-crm)
bun run --filter=api start

# WhatsApp Web pilot (from whatsapp-web-pilot)
bun run start
```

The QR is only needed when the session is not authenticated or has expired.
After it is linked, do not create a second QR session with the same account.
The pilot currently runs inbound-only: messages are filed in the CRM and Eve
creates a draft. Sending remains disabled until an explicit, reviewed policy
enables it.

## Giving a teammate access

1. Add the teammate to the private Git repository with their own GitHub account
   and give the least-privileged role that lets them contribute.
2. Give them their own CRM user and workspace role. Do not share your Google,
   Meta, OpenAI, WhatsApp session, database URL, or webhook secrets.
3. Share only `.env.example`. Each person creates a local `.env` with their own
   credentials. The WhatsApp QR/session stays on one designated machine; a
   teammate can inspect code and CRM runs without copying that session.
4. If they need to operate the pilot, use a controlled remote desktop account
   on the designated machine rather than copying `.wwebjs_auth`.

## Scrapers in the CRM

Open **Settings → Scrapers**. The page shows whether the local Maps service and
Mindcase are configured, when each run happened, and the returned candidates.
The **Ejecutar** button is a manual, auditable run. **Importar para revisión**
uses the existing intake path and creates records with `REVIEW_REQUIRED` and
`doNotContact=true`; a person must verify the evidence before any outreach.

The local Maps service is expected at:

```env
LOCAL_MAPS_SCRAPER_URL=http://127.0.0.1:8001
```

It is intentionally local for now. If the process is stopped, the CRM marks
the source as configured but offline and does not pretend a run succeeded.
