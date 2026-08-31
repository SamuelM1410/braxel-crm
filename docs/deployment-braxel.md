# Braxel deployment topology

Braxel is deployed as three Vercel projects from one private GitHub repository.
They share the same Postgres database but are independently deployable.

| Project | Root directory | Responsibility |
| --- | --- | --- |
| `braxel-web` | `apps/app` | CRM user interface and Eve proxy |
| `braxel-api` | `apps/api` | tRPC/API, auth, Lead OS intake and review endpoints |
| `braxel-agent` | `apps/agent` | Eve durable research and commercial evaluation agent |

## Required production configuration

Use a managed Postgres database. The local Docker Postgres cannot be used by a
Vercel deployment. Configure the same database URL in API and agent, then set:

```text
APP_URL=https://<web-domain>
API_URL=https://<api-domain>
AGENT_URL=https://<agent-domain>
DATABASE_URL=<pooled production Postgres URL>
DIRECT_DATABASE_URL=<direct production Postgres URL>
BETTER_AUTH_SECRET=<new production secret>
AGENT_BRIDGE_SECRET=<one shared production secret>
ALLOWED_SIGN_IN=<approved agency email(s)>
```

The agent model uses Vercel AI Gateway on Vercel through OIDC. If the selected
model/provider requires it, configure the provider key in the Vercel AI Gateway
project; never place it in source code, client-side environment variables or
GitHub.

## Deployment order

1. Create the private GitHub repository and push this code.
2. Provision Postgres and run `bun run db:deploy` against the production direct
   URL.
3. Import `braxel-api`, configure its variables and deploy it.
4. Import `braxel-agent`, configure its variables and deploy it. Run `eve link`
   from `apps/agent` if Vercel asks to link the Eve project.
5. Import `braxel-web`, configure `API_URL`, `AGENT_URL` and `APP_URL`, then
   deploy it.
6. Add production OAuth redirect URIs using the API domain, not the web domain:
   `https://<api-domain>/api/auth/callback/google`.
7. Test an authenticated company record, then test a Lead OS evaluation without
   sending outreach.

## Local Lead OS bridge while migrating

n8n remains local and is not part of this repository. Once Braxel has a public
API, replace its local CRM intake URL with the deployed API URL and protect the
intake/review endpoints with an application secret before exposing them. Do not
expose the current local webhook to the internet.
