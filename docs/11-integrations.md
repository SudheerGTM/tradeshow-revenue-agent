# 11 — Integrations

## Apollo.io

- **Purpose:** Company and contact (person) enrichment for captured leads.
- **File:** `src/lib/enrichment/apollo.ts`.
- **Auth:** `APOLLO_API_KEY` in the request header — no OAuth.
- **Endpoints used:** `/organizations/search` (company), `/mixed_people/api_search` + `/people/match` (two-step contact lookup — see [06-ai-agent-architecture.md](06-ai-agent-architecture.md) for why it's two calls).
- **Limitations:** Apollo's old `/people/search` is deprecated (422 on every call) — if contact enrichment starts silently failing again, check this first. Rate limit (429) and invalid-key (401) are surfaced as specific user-facing error strings rather than generic failures.

## Google Gemini

- **Purpose:** All AI calls — conversation intelligence, business card OCR, lead-score explanation, follow-up drafting, ROI executive summary.
- **File:** `src/lib/ai/provider.ts`.
- **Auth:** `GEMINI_API_KEY`, server-side only, never reaches the browser.
- **Model:** `GEMINI_MODEL` env var, default `gemini-2.5-flash`. Older model name strings (e.g. `gemini-2.0-flash`, `gemini-1.5-*`) 404 — this has been hit before; always check the model name first if Gemini calls start failing.
- **Configuration:** every call forces `responseMimeType: "application/json"` and strips markdown fences defensively in case the model adds them anyway.
- **Limitations:** No retry/backoff wrapper around Gemini calls themselves (retry happens at the orchestrator level for the agent step as a whole, not inside the Gemini client).

## HubSpot

- **Purpose:** CRM sync target (contacts, companies, deals, tasks) — write access gated entirely behind human approval.
- **File:** `src/lib/integrations/hubspot.ts`.
- **Auth:** Bearer token via `HUBSPOT_ACCESS_TOKEN`.
- **Operations:** search (dedup check by email/domain), create contact/company/deal/task, with HubSpot-specific association type IDs (deal→contact=3, deal→company=5, task→contact=204).
- **Limitations:** `HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID` are hardcoded to one pipeline/stage — there's no UI to choose a different HubSpot pipeline per tenant. As of the last check during this project's session work, these two values were empty in `.env.local` despite documentation elsewhere claiming they'd been set — **verify they're actually populated before relying on CRM sync working.**

## AWS (S3, Transcribe, SES)

See [10-aws-infrastructure.md](10-aws-infrastructure.md) for full detail. Quick reference:

| Service | Purpose | Auth | Status |
|---|---|---|---|
| S3 | Voice notes, business cards, avatars | IAM instance role (prod) / access keys (local) | Fully working |
| Transcribe | Voice note speech-to-text | IAM instance role | Code complete, but **this AWS account isn't subscribed to the service** — fails with `SubscriptionRequiredException` |
| SES | Invitation/reset/notification emails | IAM instance role | Working but **sandbox mode** — only sends to `info@gtmtechsol.com` until AWS approves production access |

## Future (not implemented — explicitly out of scope so far)

- **Outlook Calendar** — no calendar integration exists; meeting_request follow-up drafts are message templates, not actual calendar invites.
- **Microsoft Graph** — no code path touches Microsoft Graph; would be needed for the above or for Entra ID SSO (see [07-authentication-security.md](07-authentication-security.md)).
