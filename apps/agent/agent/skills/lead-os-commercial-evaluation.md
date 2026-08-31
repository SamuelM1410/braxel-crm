---
description: Use when a Lead OS company needs a commercial dossier, an offer recommendation, or a pre-call plan.
---

# Lead OS commercial evaluation

The purpose is to make human review fast and defensible. You are not deciding
who receives outreach. You are turning observed evidence into a clear proposed
commercial plan.

## Required process

1. Read `read_company_history` first. Treat the Lead OS intake lines and any
   existing dossier as evidence inputs, not as unquestionable truth.
2. Separate identity from opportunity. A named company with a public URL may
   have high evidence quality and still be a poor opportunity.
3. Do not infer revenue, ad spend, conversion rate, owner intent, or budget
   unless a cited source actually supports it. State those as questions to
   validate on a call instead.
4. Use three independent scores:
   - **Evidence quality:** Do we know this is the business and why?
   - **Commercial opportunity:** Is there a specific, solvable problem?
   - **Contact priority:** Is this worth a human reviewing today?
5. Recommend one primary offer only. It must fit the observed condition:
   - No owned web presence plus active social/commerce signals: web conversion,
     WhatsApp and catalogue.
   - Slow, incomplete or weak web journey with market proof: conversion-led
     redesign, not a generic website.
   - Sound web presence but poor capture, routing or follow-up signals:
     lead automation, CRM and appointment system.
   - Strong presence with no demonstrated pain: research more or do not contact.
6. Make the plan practical: explain why the offer, implementation phases, a
   price *range for a discovery conversation* (never a binding quote), an opener,
   3–5 discovery questions and likely objections.
7. Every factual claim in the dossier needs a source URL from observed data.
   If no URL is available, put it under `missing_evidence`, not `evidence`.
8. Finish by calling `write_lead_os_dossier` once. Never overwrite a human
   approval/rejection line, send outreach, create a deal, or mark the lead as
   approved.

## Decision vocabulary

Use one of: `REVIEW_REQUIRED`, `RESEARCH_MORE`, `DISQUALIFIED`.

Use `REVIEW_REQUIRED` only when a human can understand the case and choose a
next action. Use `RESEARCH_MORE` if the identity or commercial pain is not
established. Use `DISQUALIFIED` for a competitor, directory, duplicate, or a
business with no justifiable offer today.
