# n8n to code migration

This document maps the existing n8n workflows to the CRM codebase.

## Runtime decision

Next.js serves the CRM and the authenticated routes.
eve owns research, enrichment, scoring, offers and negotiation context.
Supabase remains the durable data store through the existing database package.
n8n remains a fallback until every replacement passes production checks.

## Workflow map

| n8n area | Code replacement | Status |
| --- | --- | --- |
| Maps discovery `00A` to `00G` | `discover_google_maps` Eve tool with the existing local Playwright scraper; Places API is optional | Code ready; local scraper URL required |
| Candidate intake | Existing intake route and database services | Existing |
| Website research | Existing `research_company` Eve tool | Existing |
| PageSpeed and technology signals | Agent enrichment tasks | Existing; verify production |
| Social research | ScrapeGraph enrichment plus the public-page fallback | Code ready; no Mindcase key required |
| Deterministic evidence gate | Agent evidence and capability layer | Existing |
| Eve score, offer and dossier | Agent skills and dossier tools | Existing |
| Review queue | Existing CRM company and review surfaces | Existing |
| Review decision | Existing authenticated CRM procedure | Existing |
| Approved lead sync | Mailbox tools and approved human action | Existing; keep approval gate |
| Requalification loop | Agent dispatch and scheduled tasks | Existing; verify cron |

## Safety rules

Discovery never creates a contact without a verifiable identity.
Discovery never sends a message.
Every imported candidate starts in `REVIEW_REQUIRED` and `PENDING`.
Every external message requires human approval.
Every source stores provenance and confidence.

## Provider choice

Use eve with the Vercel AI Gateway as the model path.
Use direct OpenAI only as a configured fallback.
Keep vendor clients in `apps/agent`, not the Nest API.

## Maps providers

The previous n8n flow used the local Playwright scraper, not Google Cloud.
Set `LOCAL_MAPS_SCRAPER_URL` to keep that path and avoid a Google Cloud key.
The official Places API remains an optional fallback through `GOOGLE_MAPS_API_KEY`.
It gives stable fields and quotas, but requires a billing-enabled Google Cloud project.

## Shutdown order

1. Run every code path in dry-run.
2. Import a small reviewed batch.
3. Confirm Supabase records and review decisions.
4. Confirm Gmail drafts remain approval-gated.
5. Export n8n workflows and database backups.
6. Stop n8n and remove unused Docker data.
