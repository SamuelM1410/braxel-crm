# Meta Business connection

Braxel can connect Facebook Pages and their linked Instagram professional accounts through Meta's official OAuth and Messaging webhooks.

## Production configuration

Set these server-only variables on `braxel-api`:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN` (a random value also entered in Meta)
- `META_TOKEN_ENCRYPTION_KEY` (a random value of at least 32 characters)
- `META_GRAPH_VERSION` (optional; defaults to `v24.0`)

Configure the Meta app with:

- OAuth callback: `https://braxel-api.vercel.app/api/meta/callback`
- Webhook callback: `https://braxel-api.vercel.app/api/meta/webhook`
- Products/fields: Facebook Page messaging and Instagram messaging

The person connecting must administer the Facebook Page. The Instagram account must be professional and linked to that Page. In development mode only app roles/testers can connect; broader customer use requires Meta App Review for the requested permissions.

## Safety boundary

This connection is an inbound reply assistant. Eve can answer a message only after the external user has started or continued the conversation. Requests involving price, contracts, privacy, complaints, opt-out, or ambiguity are handed to a human. It does not create cold or bulk campaigns.

## Deferred campaign pipeline

Cold campaigns are deliberately deferred. The planned pipeline is discovery/enrichment, mailbox verification (for example MillionVerifier), evidence-grounded icebreakers, then a specialist sequencer such as Smartlead or Instantly with suppression lists, warming, rate controls, and human approval. It must not reuse the inbound Meta assistant as a bulk sender.
