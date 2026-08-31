# Lead OS evaluator in Eve

Braxel uses the existing `apps/agent` Eve deployment as its commercial research
runtime. It is not another chatbot and it is not n8n: Eve works from the
company record, its evidence and the tools the CRM exposes, then leaves a
structured Lead OS dossier for a person to review.

## Flow

1. Lead OS/n8n discovers and validates candidates locally.
2. A candidate reaches Braxel with its source URLs and extracted evidence.
3. A rep opens the company, selects the **Agent** tab and asks for a Lead OS
   commercial evaluation.
4. Eve reads CRM history, applies the `lead-os-commercial-evaluation` skill and
   writes `Dossier Lead OS` only when evidence supports it.
5. The company sheet displays the diagnosis, three scores, offer, implementation
   plan, suggested range, call opener, questions, objections and evidence.
6. A human approves or rejects it. The agent never contacts a prospect.

## Model configuration

On Vercel, Eve can authenticate through Vercel AI Gateway's OIDC integration.
Outside Vercel, set `AI_GATEWAY_API_KEY` for the agent deployment. To use the
user's OpenAI/GPT account directly through the gateway, add the provider key in
the Vercel AI Gateway project; do not commit it to `.env`, GitHub or a client
bundle.

The CRM must have the same `DATABASE_URL`, `AGENT_URL`, and
`AGENT_BRIDGE_SECRET` in the app/API and agent deployments. The agent is a
separate Vercel project from the web app and API.
