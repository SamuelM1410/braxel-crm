# `api`

NestJS API for the CRM. Runs on Bun, backed by `@crm/db` and `@crm/auth`.

## Running it

```sh
cp .env.example .env        # at the repo root — one file for the whole monorepo
openssl rand -base64 32     # -> BETTER_AUTH_SECRET

bun run dev                 # watch mode on http://localhost:3001
bun run test
bun run build && bun run start:prod
```

Three values are required and the process refuses to boot without them, naming
the one it is missing: `DATABASE_URL`, `BETTER_AUTH_SECRET` and
`ALLOWED_SIGN_IN`. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are the fourth
value almost every install wants — they are both the sign-in button and the
Gmail and Calendar sync — but they are optional and set as a pair, because an
install that signs in through its own identity provider on **Settings → SSO**
needs neither. With them, register
`http://localhost:3000/api/auth/callback/google` as an authorised redirect URI
for local development. The API process listens on 3001, but the Next.js app on
3000 proxies `/api/*` and is the callback origin configured by Better Auth.
`src/config/env.validation.ts` is the full list of what this process reads;
[`docs/environment.md`](../../docs/environment.md) explains where the file is
found.

Bun is the runtime, not just the package manager: `@crm/db` and `@crm/auth`
ship TypeScript sources, so `tsc`/`node` cannot run this app directly. `tsc` is
used for type checking only (`bun run check-types`).

## Routes

| Route            | Auth       | Notes                                         |
| ---------------- | ---------- | --------------------------------------------- |
| `/api/auth/*`    | anonymous  | Mounted by `@thallesp/nestjs-better-auth`     |
| `/auth/me`       | required   | Cached profile of the signed-in user          |
| `/auth/session`  | optional   | Whether the caller is signed in               |
| `/health`        | anonymous  | 200 with a database round-trip, 503 otherwise |
| `/internal/sync/google` | `CRON_SECRET` bearer | Vercel Cron entrypoint for Gmail/Calendar sync. Fails closed when the secret is unset. |
| `/api/whatsapp-web/health` | anonymous | Local WhatsApp Web pilot status and reply policy. |
| `/api/whatsapp-web/inbound` | `WHATSAPP_WEBHOOK_SECRET` bearer | Stores an inbound pilot event, deduplicates it, and returns a smart Eve decision. |
| `/api/whatsapp-web/outbound` | `WHATSAPP_WEBHOOK_SECRET` bearer | Records a reply actually sent by the local pilot, deduplicated by the WhatsApp message id. |
| `/api/whatsapp-web/metrics` | CRM session or `WHATSAPP_WEBHOOK_SECRET` bearer | Returns the WhatsApp sales funnel and operational recommendations. |

## Local WhatsApp Web pilot

The companion `whatsapp-web-pilot` process forwards individual inbound WhatsApp
Web messages to `/api/whatsapp-web/inbound`. The payload carries the sender
number, display name, text, external message id, and received timestamp. The API
normalizes the phone, reuses or creates the CRM contact, links a
`SocialThread`/`SocialMessage` with channel `WHATSAPP`, and enforces the unique
`threadId_externalMessageId` key so retries are safe. A generated Eve response
is stored in the message metadata. With `WHATSAPP_AUTO_REPLY_MODE="smart"`, low-risk
replies return in `reply`; sensitive or ambiguous cases return
`approvalRequired: true` with a review reason. Configure the pilot's `CRM_REPLY_SECRET` to the API's
`WHATSAPP_WEBHOOK_SECRET` (the local `CRM_INTAKE_SECRET` is accepted as a
backwards-compatible fallback). The pilot calls `/api/whatsapp-web/outbound`
after a reply is actually sent, so the CRM measures real responses rather than
only generated drafts. The `/api/whatsapp-web/metrics` endpoint uses those
events plus deterministic Spanish sales signals to report `NEW`, `QUALIFYING`,
`INTERESTED`, `OBJECTION`, `CALL_REQUESTED`, `HANDOFF` and `OPT_OUT` stages.
Signed-in CRM users can read metrics without the pilot secret. The score and
recommendations are operational signals, not promises of conversion.
## ScrapeGraphAI lead generation

The CRM exposes one scraper provider, `SCRAPEGRAPH`, through the Lead
generation screen (`/<slug>/leads`). The button calls the configured worker's
`POST /research` endpoint, stores the evidence in `scraperRun`, and keeps
importing separate and review-gated. Maps and Mindcase are not used by this
flow. Set `SCRAPEGRAPH_URL` (default local worker: `http://127.0.0.1:8011`)
and optionally `SCRAPEGRAPH_DEFAULT_URL`; the URL field in the screen can
override that default for a single run. A worker health check is shown before
execution, and no lead is contacted automatically.

## Consent-gated Gmail campaigns

The `google` tRPC router exposes `campaigns`, `createCampaign`,
`activateCampaign`, `pauseCampaign`, `runCampaign`, and `optOutRecipient`. A campaign item must
include a recorded `consentAt` and `consentSource`; recipients are deduplicated
and recipients that opted out cannot be queued again. Each item has a unique
idempotency key and every completed send is written to the activity timeline. The existing
`/internal/sync/google` cron also drains active campaigns using the campaign's
daily and per-minute limits, with retry backoff and automatic pausing when the
Gmail grant is missing or rate-limited.

This queue is intentionally Gmail-only. The local `whatsapp-web-pilot` remains
an inbound/supervised reply pilot and does not send bulk campaigns. Set the same
`WHATSAPP_WEBHOOK_SECRET` in the API and pilot, point `CRM_REPLY_URL` at the
route above, and keep `AUTO_REPLY_ENABLED=false` while validating. Production
WhatsApp outreach must use the approved Business Platform flow, templates, and
opt-in records.

## How auth is wired

This process owns authentication. It mounts `/api/auth/*` and is the only one
that writes session cookies; the Next.js app in `apps/app` reads those sessions
straight from Postgres via `@crm/auth` and calls the routes above with
`credentials: "include"`.

`AuthModule.forRoot({ auth })` mounts the Better Auth handler and registers a
**global** `AuthGuard`, so every route is protected unless it opts out:

```ts
@Get('public')
@AllowAnonymous()          // no session required
@OptionalAuth()            // session optional; @Session() may be undefined
```

It also calls `enableCors({ origin: trustedOrigins, credentials: true })` for
the whole app, which is what lets the browser at `localhost:3000` talk to it —
`APP_URL` is the single knob for that, comma-separated if the app is served from
more than one origin.

`main.ts` creates the app with `bodyParser: false` — Better Auth needs the raw
request body, and the library installs its own parsers around the auth routes.

`AuthHooksService` uses `@AfterUpdate("user")` to drop a cached profile the
moment its row changes. Database hooks require `databaseHooks: {}` in the Better
Auth options and endpoint hooks require `hooks: {}` (both set in `@crm/auth`);
the library throws at startup without them.

## Caching

`AppCacheModule` registers `@nestjs/cache-manager` globally. It uses `REDIS_URL`
when set and otherwise falls back to a per-instance in-memory store — fine for
local development, not for more than one API instance.

`AuthService.getProfile` is the reference pattern: read through the cache, write
with an explicit TTL, invalidate on change.

## Notes

- Better Auth stores rate limits in the database (`rateLimit.storage`), so every
  request to `/api/auth/*` needs a reachable Postgres. Moving this to
  `secondaryStorage` backed by Redis would remove that dependency.
- Environment variables are validated at boot by `src/config/env.validation.ts`.
  The process refuses to start on a bad config.
