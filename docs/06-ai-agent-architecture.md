# 06 — AI Agent Architecture

Eight business-logic "agents" plus an orchestrator that chains six of them (Opportunity and Tenant Provisioning run outside the orchestrator, triggered directly from their own API routes — see each section below). **None of them send anything externally without a human approval step**, and **none of them let AI set a number** — scores, ROI%, and revenue figures are always deterministic; AI only explains, drafts, or summarizes. This is the project's single most important guardrail, enforced consistently across every agent below.

> **Corrected during the 2026-08-18 handoff documentation pass:** this doc previously omitted the Opportunity Agent (live since Release 11) and the Tenant Provisioning Agent (added Release 13.8) entirely — both existed in code but were never written up here. Both are now included below.

## 1. Conversation Intelligence Agent

- **Purpose:** Extract pain points, urgency, budget/decision signals, and next-best-action from a conversation transcript or notes.
- **File:** `src/lib/ai/provider.ts` (`analyzeConversation`/`analyzeWithGemini`), wrapper in `src/lib/agents/conversation-agent.ts`.
- **Inputs:** Lead name, company, job title, event, raw conversation text.
- **Model:** Gemini, `responseMimeType: "application/json"` forced.
- **Output schema:** `pain_points[]`, `product_interest[]`, `business_need`, `urgency` (low/medium/high/unknown), `timeline`, `budget_signal`, `decision_maker_signal`, `competitor_mentioned`, `next_best_action`, `summary`, `recommended_follow_up`, `confidence_score`, `needs_human_review`.
- **Guardrails:** Confidence < 70 forces `needs_human_review=true`; urgency clamped to the 4 allowed values; explicit prompt rule against inventing information not present in the input; explicit prompt rule against suggesting emails be sent or deals created.
- **Failure handling:** Malformed JSON from Gemini throws, caught by the agent wrapper, which marks the step skipped (if no input) or failed.
- **Status:** Fully wired — both a manual trigger (`/api/conversation-insights/analyze`) and orchestrator step 1.

## 2. Business Card OCR

- **Purpose:** Extract contact fields from a business-card photo.
- **File:** `extractBusinessCard()` in `src/lib/ai/provider.ts`.
- **Output schema:** firstName, lastName, jobTitle, companyName, email, phone, country — all strings, empty string (never null) if illegible.
- **Guardrail:** Same anti-invention rule; review screen in the UI is the actual trust boundary — OCR output is never written to a lead without a human looking at it first (see [03-business-workflows.md](03-business-workflows.md)).
- **Status:** Fully implemented.

## 3. Apollo Enrichment Agent

- **Purpose:** Company + contact enrichment via Apollo.io.
- **Files:** `src/lib/enrichment/apollo.ts`, `src/lib/agents/enrichment-agent.ts`.
- **Flow:** Company search via `/organizations/search`. Contact search is **two-step** — `/mixed_people/api_search` (obfuscated candidate) then `/people/match` (full reveal) — because Apollo's old `/people/search` endpoint is deprecated and returns 422.
- **Error isolation:** A `settle()` helper wraps the company and contact lookups independently, so one failing doesn't block the other — partial enrichment is a valid outcome, not a hard failure.
- **Junk-email filtering:** test@test.com, @test.com, n/a, example.com, noemail, none@, fake@ are excluded from the contact search.
- **Confidence:** Deterministic, not AI — 85 if company name found else 50; 80 if contact ID found else 40. Below 70 → `needs_review`.
- **Cost control / idempotency (Release 13.7.1):** `runEnrichment()` now skips the (paid, rate-limited) Apollo call entirely when both company and contact enrichment already exist with `enrichmentStatus: "enriched"` — logged as `enrichment_skipped_cached`. This applies to orchestrator-triggered re-runs only; the manual "Refresh Enrichment" button (`POST /api/enrichment/enrich`) always calls Apollo via an explicit `forceRefresh` option, since that's the user-requested-refresh path by design.
- **Status:** Fully wired, orchestrator step 2, non-critical (workflow continues even if this fails).

## 4. Lead Scoring Agent

- **Purpose:** Deterministic 0–100 score across six weighted components, plus an AI explanation layered on top.
- **File:** `src/lib/agents/lead-scoring.ts`.
- **The formula is pure TypeScript, not AI:**

  | Component | Max | Driven by |
  |---|---|---|
  | Company Fit | 25 | Employee count (enriched) + logistics/supply-chain industry bonus |
  | Authority | 20 | Seniority (C-suite/owner/VP=20, manager=14, senior=10) + decision-maker signal |
  | Need/Pain | 20 | Pain point count, product interest count, business-need text length |
  | Urgency/Timeline | 15 | Urgency enum + timeline keywords (Q1/Q2/month/week) + budget signal |
  | Engagement | 10 | Notes length, conversation insight present, consent given, email present |
  | Data Quality | 10 | Email/phone present, enrichment completeness |

- **Classification:** score ≥80 → hot, ≥55 → warm, else cold — **unless** insight confidence <70 or required data is missing, in which case it's forced to `needs_review` regardless of the numeric score.
- **AI's role:** A separate Gemini call only produces `score_explanation`, `score_drivers[]`, `risks[]`, and `recommended_next_action` — it receives the already-computed score as context and cannot change it. If the AI call fails, the deterministic score still stands; the row is marked confidence=50, `needs_human_review=true`.
- **Opportunity estimate:** Also deterministic — base value $5k–$50k scaled by company size, close probability 40%/20%/5%/10% by classification.
- **Status:** Fully wired, orchestrator step 3, **critical=true** (a workflow failure here stops the chain, since follow-up depends on a score existing).

## 5. Follow-Up Agent

- **Purpose:** Draft (never send) a follow-up message appropriate to the lead's classification.
- **File:** `src/lib/agents/followup-agent.ts`.
- **Strategy by classification:** hot → email + meeting_request (priority high, immediate); warm → email + LinkedIn (medium, 24h); cold → email only (low, 1 week); `needs_review` → no drafts, returns a manual-review recommendation instead.
- **Prompt guardrails:** Forbids generic phrases ("just checking in"); requires the draft to reference specific pain points; explicitly forbids claiming an action has already been taken (these are drafts); LinkedIn messages capped under 300 chars; phone_call type produces a talking-points script, not a message.
- **Failure handling:** AI failure sets confidence=30, `needs_human_review=true`, and the draft body becomes the failure reason (visible to the reviewer, not silently swallowed).
- **Idempotency (Release 13.7.1):** `upsertDraftFollowup()` refreshes an existing `draft`-status recommendation for the same tenant+lead+followupType in place on workflow re-run, instead of creating a duplicate. Once a draft is approved/rejected it's no longer `draft` status, so the next run is free to create a fresh one without touching that historical record.
- **Status:** Fully wired, orchestrator step 4, non-critical. **No send capability exists anywhere in the codebase** — approval only marks a draft `approved`, it does not transmit it.

## 6. CRM Sync Agent

- **Purpose:** Prepare a HubSpot payload; only ever writes to HubSpot after explicit human approval.
- **File:** `src/lib/agents/crm-sync-agent.ts` (confirmed exact path — the prior version of this doc flagged this as unconfirmed).
- **Sync plan by classification:** hot → contact+company+deal+task; warm → contact+company+task; cold → contact only; `needs_review` → blocked entirely (`allowSync=false`).
- **Preparation is read-only:** `prepareCRMRecord()` makes **zero** database writes beyond the `pending_approval` job row itself — no HubSpot call happens until `/api/crm-sync/:id/approve` is called by a manager/tenant_admin.
- **Duplicate detection:** Best-effort search in HubSpot by email/domain before creating; failures here don't block the preview, since it's just a heads-up to the approver.
- **Execution order:** contact → company → deal (linked) → task, tracking each created HubSpot ID; on error, the job is marked `failed` with a reason, retryable by tenant_admin.
- **Policy gate:** `agent_policies` row "Minimum score for CRM recommendation" can block the step entirely below a configured score threshold (default 60).
- **Idempotency (Release 13.7.1):** `upsertPendingCRMSyncJob()` ensures re-running the workflow for the same lead refreshes an existing `pending_approval` job's payload in place instead of inserting a duplicate — only one active job per tenant+lead+syncType at a time. Completed/failed jobs are left untouched as historical records.
- **Graceful HubSpot-not-connected handling (Release 13.7.1):** `executeSync()` now checks `HUBSPOT_ACCESS_TOKEN` up front and throws a specific, user-facing "HubSpot credentials are not connected in this tenant" error instead of letting a raw env-var error surface; the CRM Sync panel also shows this as a banner before Approve is even clicked (`GET /api/crm-sync/status`, `src/components/CRMSyncPanel.tsx`).
- **Status:** Fully wired, orchestrator step 5, non-critical, policy-gated.

## 7. ROI Agent

- **Purpose:** Deterministic per-event ROI aggregation, with an optional AI narrative summary.
- **File:** `src/lib/agents/roi-agent.ts`.
- **All metrics are computed math, not AI** — lead/qualified/hot counts, pipeline by stage, cost-per-lead, ROI% = `(wonRevenue - eventCost) / eventCost × 100`.
- **AI summary:** Purely descriptive of already-computed numbers; if `GEMINI_API_KEY` is missing, falls back to a deterministic template sentence rather than failing — confidence score reflects data completeness, not narrative quality.
- **Status:** Fully wired, orchestrator step 6, non-critical/optional per the original spec.

## 8. Opportunity & Pipeline Intelligence Agent

- **Purpose:** Convert a qualified (Hot/Warm) lead into an internal trackable opportunity. **Internal pipeline tracking only** — does NOT create or update anything in HubSpot; CRM sync (agent 6) is a fully separate, independently-approved workflow.
- **File:** `src/lib/agents/opportunity-agent.ts` (Release 11).
- **Not orchestrator-wired** — triggered directly by `POST /api/opportunities` (and previewed read-only via `POST /api/opportunities/prepare`), not a step in the six-agent workflow chain. A lead becomes an opportunity as an explicit user action, not automatically.
- **Eligibility gate (`createOpportunityFromLead()`):** blocks if the lead hasn't given consent, has no lead score yet, or the score is `needs_review`. A `cold` classification is blocked unless `managerOverride=true` is passed (booth users can't self-override; see [07-authentication-security.md](07-authentication-security.md)).
- **Deterministic fields:** stage/priority/probability default by classification (hot → `qualified`/high/40%; warm → `identified`/medium/20%; cold-with-override → `identified`/low/10%, matching `STAGE_PROBABILITY`). `amount` comes from the lead score's `estimatedOpportunityValue`; `expectedRevenue = amount × probability`. **None of this is AI-generated.**
- **AI's role:** A separate Gemini call (`getAiRecommendation()`) produces only `nextStep`, `riskNotes`, and `aiRecommendation` — narrative text layered on top of the already-decided stage/amount/probability, using the lead's conversation insight, enrichment, follow-up, and CRM-sync-status as context. It cannot change any numeric field, matching the guardrail enforced everywhere else in this doc.
- **Status:** Fully wired via direct API routes, not orchestrator-wired, no policy gate.

## 9. Tenant Provisioning Agent

- **Purpose:** Provision a brand-new tenant (+ default event + tenant_admin invitation) from an approved self-service access request — the backend of Release 13.8's controlled tenant self-registration flow.
- **File:** `src/lib/agents/tenant-provisioning-agent.ts` (Release 13.8).
- **Not orchestrator-wired** — has nothing to do with the per-lead six-agent workflow. Triggered only by `POST /api/access-requests/:id/provision`, and only reachable after a `platform_admin` has explicitly approved the request (`POST /api/access-requests/:id/approve`) — **never called directly from the public `/request-access` form**.
- **Flow:** public visitor submits `/request-access` (honeypot field + IP/user-agent capture for spam signal, no auth) → row created in `tenant_access_requests` (`status: requested`) → platform_admin notified by email → admin reviews at `/admin/access-requests` → approve/reject → on approve, provisioning runs in a single DB transaction: create `tenants` row (slug/subdomain auto-derived from company name, collision-suffixed), optionally create a default `events` row if an event name was given, create a `tenant_admin` `user_invitations` row (7-day expiry, same mechanism as regular invitations — see [07-authentication-security.md](07-authentication-security.md)), audit-log `tenant_provisioned` + `tenant_admin_invited`, then send the approval + invitation emails **outside** the transaction (so an email failure never rolls back a successful provision).
- **Idempotent by design:** re-calling provisioning for an already-provisioned request (`status: provisioned`) returns the existing tenant/invitation rather than creating duplicates — checked explicitly before the transaction runs.
- **Duplicate-tenant heads-up:** best-effort check against `companyWebsite`'s domain before provisioning; logs a warning but does not block (the admin already approved, so provisioning proceeds regardless — this is a signal for the admin, not a hard gate).
- **Guardrail:** **No code path provisions a tenant without explicit `platform_admin` approval first.** The public form only ever writes a `requested`-status row; it cannot reach `provisionTenantFromAccessRequest()` on its own.
- **Status:** Fully wired (Release 13.8), not orchestrator-wired, no policy gate — gated entirely by the `platform_admin` approval step instead.

## 10. Agent Orchestrator

- **Files:** `src/lib/orchestrator/orchestrator.ts`, `types.ts`, `agents.ts`, `event-bus.ts`, `policies.ts`.
- **Execution model:** Synchronous, in-process, inside the HTTP request that calls `POST /api/workflows/start`. There is no queue or background worker.
- **The `AgentAdapter` interface** (`types.ts`) is the explicit seam for a future swap to AWS Step Functions or Bedrock AgentCore — every agent is wrapped in an adapter exposing `agentName`, `critical`, `execute(ctx)`, and `classifyFailure(error)`. Swapping infrastructure later should only require new adapter implementations, not touching agent logic, schema, or UI.
- **Step order:** Conversation Intelligence → Enrichment → Lead Scoring (critical) → Follow-Up → CRM Sync (policy-gated) → ROI.
- **Retry logic:** Up to `agent_registry.maxRetries` (default 3) for agents with `supportsRetry=true`. Failures are classified as `temporary` / `validation` / `permission` — only `temporary` failures are retried, with exponential backoff (30s/60s/120s).
- **Resume:** `resumeWorkflow()` retries the last failed step once and continues from there if it succeeds.
- **Event bus:** In-process publish/subscribe for cross-cutting events (`lead_scored`, `followup_generated`, `roi_calculated`); subscriber exceptions are isolated via `Promise.allSettled` so one bad listener can't break the workflow.
- **Audit:** Every step logs `workflow_started`/`agent_started`/`agent_completed`/`agent_failed`/`workflow_completed`/`workflow_failed` to `audit_logs`, tied to the `workflow_runs`/`agent_executions` rows.
- **Status:** Fully operational; all six agents registered and seeded (migration `0012_orchestrator.sql`).

## Summary table

| Agent | AI or deterministic | Critical to workflow | Can write externally without approval? |
|---|---|---|---|
| Conversation Intelligence | AI (Gemini) | No | No |
| Enrichment | Deterministic (Apollo API) | No | No (Apollo is read-only enrichment) |
| Lead Scoring | Deterministic + AI explanation | **Yes** | No |
| Follow-Up | AI (Gemini) | No | No — drafts only, never sent |
| CRM Sync | Deterministic | No | **No** — requires explicit human approval |
| ROI | Deterministic + optional AI summary | No | No |
| Opportunity & Pipeline | Deterministic + AI narrative (next step/risks only) | No (not orchestrator-wired) | No — internal pipeline tracking only, never touches HubSpot |
| Tenant Provisioning | Deterministic (no AI) | No (not orchestrator-wired) | **No** — requires explicit `platform_admin` approval of the access request first |

See [11-integrations.md](11-integrations.md) for the HubSpot, Apollo, Gemini, email, S3, and Transcribe client details that these agents depend on. See [RELEASE-14-ICP-PLAN.md](RELEASE-14-ICP-PLAN.md) for where the Conversation Intelligence and Lead Scoring agents' currently-hardcoded industry assumptions live, and the proposed plan to make them tenant-configurable.
