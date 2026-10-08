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
5. Test the company against Braxel's commercial catalogue. Recommend one offer
   only when public evidence supports it:
   - **Páginas web que convierten** (`CONVERSION_WEBSITE`): an operating B2B or
     service business has no owned website, or has a basic public presence with
     a clear route to improve trust and enquiries.
   - **Aplicaciones web a medida** (`WEB_APP_CUSTOM`): a repeated operational
     process is visible, such as quotes, bookings, service histories, client
     access or manual coordination. Do not infer this from a generic phone
     number alone.
   - **Tienda online** (`ECOMMERCE_STORE`): the company visibly sells products
     and needs a catalogue, product pages or a purchase journey.
   - **Rediseño y CRO** (`CRO_REDESIGN`): a live website or store has clear,
     attributable friction in its message, journey, trust signals or calls to
     action.
   - **Recompra y recuperación para ecommerce** (`ECOMMERCE_RETENTION`): a
     live ecommerce operation has evidence of a checkout, repeat-purchase
     audience, abandoned carts, campaigns or post-purchase communication.
   The CRM, lead capture, scraping and internal follow-up tools are not offers.
   Never recommend them to a prospect.
6. Set the commercial fit accurately:
   - Use `STRONG_FIT` only when you have a real operating business, one
     evidence-backed catalogue match, a public source URL and a valid direct
     business channel.
   - Use `POTENTIAL_FIT` when one material fact is missing. Set status to
     `RESEARCH_MORE`. Do not recommend outreach.
   - Use `NO_FIT` when there is no supported catalogue match, the record is a
     competitor, directory, duplicate, consumer profile, inactive business or
     lacks a valid business identity. Set status to `DISQUALIFIED`.
7. Make the plan practical: explain why the offer, implementation phases, a
   price *range for a discovery conversation* (never a binding quote), an opener,
   3–5 discovery questions and likely objections.
8. Every factual claim in the dossier needs a source URL from observed data.
   If no URL is available, put it under `missing_evidence`, not `evidence`.
9. Finish by calling `write_lead_os_dossier` once. Never overwrite a human
   approval/rejection line, send outreach, create a deal, or mark the lead as
   approved.

## Decision vocabulary

Use one of: `REVIEW_REQUIRED`, `RESEARCH_MORE`, `DISQUALIFIED`.

Use `REVIEW_REQUIRED` only for a `STRONG_FIT`. Use `RESEARCH_MORE` for a
`POTENTIAL_FIT`. Use `DISQUALIFIED` for `NO_FIT`.
