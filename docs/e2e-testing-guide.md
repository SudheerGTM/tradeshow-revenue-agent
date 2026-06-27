# End-to-End Testing Guide

A concrete, ordered manual walkthrough of the entire application — from first login through the full lead-to-revenue pipeline to admin/IAM and multi-tenant isolation. Pairs with [15-testing-guide.md](15-testing-guide.md), which describes *how* testing is generally done in this project (no automated suite exists); this doc is the *script* to actually run.

Run this in full after any change that touches auth, the agent pipeline, or schema. Run the relevant section after a narrower change.

## 0. Prerequisites

```sh
LC_ALL="en_US.UTF-8" /opt/homebrew/opt/postgresql@16/bin/pg_ctl \
  -D /opt/homebrew/var/postgresql@16 -o "-p 5433" -l /tmp/pg16.log start
npm install
npm run build   # catches type errors before you waste time clicking around a broken build
npm run dev
```

Seeded users (`Password123!` for all — see [01-project-overview.md](01-project-overview.md)):

| Email | Role | Tenant |
|---|---|---|
| `admin@platform.com` | platform_admin | none (cross-tenant) |
| `admin@demo.com` | tenant_admin | Demo Logistics (`subdomain: demo`) |
| `manager@demo.com` | manager | Demo Logistics |
| `booth@demo.com` | booth_user | Demo Logistics |
| `admin@multimodal.com` | tenant_admin | Multimodal Demo (`subdomain: multimodal`) |

---

## 1. Authentication

### 1.1 Login / logout
- [ ] Visit `/login`, sign in as `admin@demo.com`. Redirects to `/dashboard`.
- [ ] Session shows correct `tenantId` (check `/api/auth/session` directly if in doubt).
- [ ] Log out (TopBar) — returns to `/login`, session cleared.

### 1.2 Tenant-scoped login (subdomain)
Wildcard DNS isn't live publicly yet — simulate via a `Host` header rather than a real subdomain:
```sh
curl -s -c c.txt -H "Host: demo.tradeshow-agent.gtmtechsol.ai" http://localhost:3000/api/auth/csrf
# then POST credentials with the same Host header to /api/auth/callback/credentials
```
- [ ] `demo` subdomain + `admin@demo.com` → succeeds.
- [ ] `demo` subdomain + `admin@multimodal.com` (valid creds, wrong tenant) → fails.
- [ ] An unmapped subdomain (e.g. `nosuchtenant`) → distinct `code=tenant_not_found`, not a generic credentials error.
- [ ] Apex domain (`localhost:3000`, no subdomain) → still works exactly as before, tenant-agnostic by email (this is intentional until wildcard DNS goes live — see [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md)).

Full detail and rationale: [tenant-auth-review.md](tenant-auth-review.md).

### 1.3 Account lockout
- [ ] Attempt login with the wrong password 5 times for a disposable test account → account status flips to `locked` (`select status from users where email=...`).
- [ ] 6th attempt (even with correct password) is rejected.
- [ ] tenant_admin clicks "Unlock" on `/admin/users` → account reactivates, login succeeds again.

### 1.4 Password reset (self-service and admin-initiated)
- [ ] `/forgot-password` → submit a real seeded email → check `password_reset_tokens` table for a fresh row, or check server logs/SES (sandbox mode — only `info@gtmtechsol.com` receives real email, see [12-environment-variables.md](12-environment-variables.md)).
- [ ] Open `/reset-password?token=...` with that token → set a new password meeting policy (12+ chars, upper/lower/digit/special) → login with new password works.
- [ ] Attempt reusing one of the last 5 passwords → rejected.
- [ ] Admin-initiated reset (tenant_admin → Users → "Reset Password" on another user) → confirm it **only** sends an email link, never displays or returns a raw password (`PATCH /api/users/:id` must not accept a `password` field — see [07-authentication-security.md](07-authentication-security.md)).
- [ ] Expired or already-used token → `POST /api/auth/reset-password` returns 404 with a clear error, not a 500.

### 1.5 Invitations
- [ ] tenant_admin → Users → Invite, enter an email + role. Confirm `canAssignRole` prevents assigning `tenant_admin`/`platform_admin` from a tenant_admin's invite form.
- [ ] Open the invitation link (`/invite/[token]`) → set a password → account created, **no `users` row existed before acceptance** (`select * from users where email=...` should return nothing pre-accept).
- [ ] Login with the new account → correct tenant/role.
- [ ] Resend an invitation → old token invalidated, new one works, old one doesn't.
- [ ] Cancel a pending invitation → accept link for it now fails with a clear error.
- [ ] Expired invitation token → 404, not 500.

---

## 2. Onboarding

- [ ] First login for a freshly invited user redirects into the welcome wizard (`/welcome`) if `onboardingStep < 5`.
- [ ] Step through all wizard steps; confirm `users.onboardingStep` increments in the DB after each (`PATCH` call visible in network tab).
- [ ] Completing the wizard sets `onboardingStep = 5` and the dashboard's adoption stats (tenant_admin view) reflect it.

---

## 3. Lead capture — all four entry points

### 3.1 Manual entry
- [ ] `/leads/new` → fill required fields (first name, company, email or phone) → submit → lead appears in `/leads` with `source = "manual"`.
- [ ] Submit with neither email nor phone → blocked with a clear 400, not a silent failure.

### 3.2 QR badge scan
- [ ] Use the QR scanner UI (booth capture flow) against a test badge QR payload → confirm `qrScannedAt` and `qrRawText` populate, `source = "qr_badge_scan"`.
- [ ] Confirm `captureDurationSeconds` is recorded (dashboard's Quick Capture adoption stats use this).

### 3.3 Business card OCR
- [ ] Capture/upload a business card photo → confirm it uploads to S3 (`business-cards/initiate-upload` → `complete-upload`), then Gemini Vision OCR populates the lead form fields for review before save.
- [ ] **On a real iPhone**, not just desktop preview — confirm the camera preview isn't black (known iOS Safari `getUserMedia` race, see [16-troubleshooting.md](16-troubleshooting.md)). Desktop/headless preview will not catch this regression.
- [ ] Confirm the resulting lead has `source = "business_card"` and the original image is retained (`business_card_images` table) for audit.

### 3.4 Public capture link (no login required)
- [ ] `POST /api/capture/[tenant]/[event]` (or the corresponding public form page, if one exists for the event) with no session — confirm it succeeds for a valid tenant+event and is rejected for an invalid one.
- [ ] Confirm `consentGiven` is captured if present in the submitted payload.

### 3.5 Duplicate detection
- [ ] Submit two leads with the same email at the same event → `POST /api/leads/check-duplicate` (called by the form before final submit) flags it; confirm the UI surfaces this rather than silently creating a duplicate.

---

## 4. Conversation intelligence (voice notes)

- [ ] Record/upload a voice note attached to a lead → confirm S3 upload completes (`voice-notes/initiate-upload` → `complete-upload`).
- [ ] Trigger transcription (`POST /api/transcripts/start`) → poll `GET /api/transcripts/status` until `completed`. **Note:** AWS Transcribe subscription gap is a known account-level issue, not a code bug — if this fails, check whether the AWS account is actually subscribed before assuming a regression (see [19-known-limitations.md](19-known-limitations.md)).
- [ ] Trigger `POST /api/conversation-insights/analyze` on the completed transcript → confirm `conversation_insights` row populates with `productInterest`, `urgency`, `status`.
- [ ] Confirm the AI only **summarizes/explains** — no numeric score, ROI, or revenue figure should originate from this step (guardrail — see `STATUS.md`).

---

## 5. Enrichment

- [ ] Trigger `POST /api/enrichment/enrich` for a lead with a company domain → confirm `company_enrichment` and `contact_enrichment` rows populate from the real Apollo.io API (no mock layer exists — this hits the live API, see [15-testing-guide.md](15-testing-guide.md)).
- [ ] Confirm `enrichmentStatus` transitions correctly (pending → completed/failed) and a failed enrichment doesn't block the rest of the pipeline.

---

## 6. Lead scoring

- [ ] Trigger `POST /api/lead-scores/generate` for an enriched lead → confirm a `lead_scores` row with a numeric `score` and `classification` (hot/warm/cold).
- [ ] **Guardrail check:** confirm the score is deterministic — re-running generation on identical input data produces the identical score (AI may only annotate/explain it, never set the number itself).
- [ ] Confirm dashboard's hot/warm/cold counts and expected-revenue totals match what you'd compute by hand from the `lead_scores` rows.

---

## 7. Follow-up recommendations

- [ ] Trigger `POST /api/followups/generate` for a scored lead → confirm a `followup_recommendations` row with `priority` and a draft message.
- [ ] **Guardrail check:** confirm there is no send capability anywhere in the UI or API for this draft — it can only be reviewed/approved as a *recommendation*, never dispatched to the lead (see `STATUS.md` guardrails — "Follow-up drafts are never sent").
- [ ] Mark a recommendation as approved/reviewed in the UI → confirm `followupStats` on the dashboard reflects it.

---

## 8. CRM sync — prepare/approve human-in-the-loop

This is the most important guardrail in the app to verify on every change near this code path.

- [ ] `POST /api/crm-sync/prepare` for a qualified lead → confirm a `crm_sync_jobs` row is created with status `pending`, **and confirm nothing was written to HubSpot** (check the HubSpot account directly, not just this app's DB).
- [ ] Approve the prepared sync via the UI (manager/tenant_admin role) → **only now** confirm the deal/contact actually appears in HubSpot.
- [ ] Attempt the approval as a `booth_user` → must be rejected (booth_user cannot approve CRM syncs per the role matrix in [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md)).
- [ ] Confirm `HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID` are actually set before trusting this end-to-end — these were previously found empty in `.env.local` during a prior session (see [12-environment-variables.md](12-environment-variables.md)); if empty, deal creation may silently target a wrong/default pipeline.

---

## 9. Opportunities & Pipeline

- [ ] After a CRM sync approval (or directly via `POST /api/opportunities/prepare`), confirm an `opportunities` row exists, linked to the originating lead.
- [ ] `/pipeline` Kanban view — drag an opportunity between stages → confirm `opportunity_activities` logs the stage change and the stage probability updates.
- [ ] As `manager` or `tenant_admin`: edit an opportunity's financial fields (expected revenue) → succeeds.
- [ ] As `booth_user`: attempt the same edit → rejected (booth_user cannot edit opportunity financial fields).
- [ ] As `platform_admin`: attempt the same edit → also rejected — platform_admin is explicitly forbidden from opportunity-financial edits (an oversight/admin role, not a salesperson role — see [07-authentication-security.md](07-authentication-security.md)).

---

## 10. Events & ROI Analytics

- [ ] Create an event (`/events`), add event costs (`/events/[id]/costs`).
- [ ] Visit `/roi-analytics` and `/analytics/event/[id]` — confirm pipeline/expected-revenue/ROI% figures match a hand calculation from the underlying `opportunities`/`event_costs` rows (these numbers must always be deterministic SQL/TS, never AI-set — guardrail).
- [ ] Generate the event report (`/events/[id]/report`) — confirm PDF/Excel export succeeds and contains the same figures shown on screen.
- [ ] **Performance note:** the dashboard's ROI section recalculates synchronously per event on every load — known N+1 issue, not yet fixed (see [performance-review.md](performance-review.md)). Confirm it still produces correct numbers even though it's slow; don't conflate "slow" with "wrong" when testing.

---

## 11. Agent Orchestrator / Workflows

- [ ] `/workflows` → start a new workflow run for a lead (`POST /api/workflows/start`) → confirm it chains through the expected agent sequence (conversation intelligence → enrichment → scoring → follow-up → CRM sync prep → ROI) and `workflow_runs`/`agent_executions` rows match the expected step-by-step trace.
- [ ] `/workflows/[id]` detail view shows per-step status, including any retry behavior on a deliberately-failing step (e.g. temporarily misconfigure an API key for one agent and confirm the orchestrator retries per its policy, then marks the step failed rather than silently succeeding).
- [ ] `/agents` page lists the agent registry — confirm it matches what's actually wired into the orchestrator (`src/lib/orchestrator/agents.ts`).

---

## 12. Admin & IAM

### 12.1 User management (`/admin/users`, tenant_admin)
- [ ] Invite, suspend, reactivate, unlock, change role (within `canAssignRole` limits), delete — each action produces the corresponding `audit_logs` row (`user_invited`, `user_suspended`, `role_changed`, etc.).
- [ ] Restrict a user's event access (`allEvents = false` + specific `user_event_access` rows) → confirm `getAccessibleEventIds()` actually narrows what that user sees on `/leads`.

### 12.2 Tenant management (`/admin/tenants`, platform_admin only)
- [ ] As `platform_admin`, view/manage tenants across the whole platform.
- [ ] As `tenant_admin`, confirm `/admin/tenants` is **not** accessible (cross-tenant route, platform_admin only).

### 12.3 Settings
- [ ] `/settings/tenant` — tenant_admin can view/edit tenant-level settings (name, subdomain, event name).
- [ ] `/settings/security` — review the security/adoption dashboard (invited/activated/active/inactive counts) against a direct DB count to confirm accuracy.

### 12.4 Profile
- [ ] `/profile` — update name/avatar (`POST /api/users/me/avatar`), confirm the change persists and reflects in the TopBar immediately.

---

## 13. Multi-tenant isolation (cross-cutting — re-run after any query change)

- [ ] Log in as `admin@demo.com` and `admin@multimodal.com` in two separate browser sessions (or incognito) → confirm neither sees the other's leads, events, opportunities, or users anywhere in the UI.
- [ ] Attempt a direct API call for a resource ID belonging to the *other* tenant while authenticated as the first (e.g. `GET /api/leads/[other-tenant's-lead-id]`) → must be blocked/empty, not a cross-tenant data leak.
- [ ] `booth_user` test: confirm they only see leads/voice-notes/workflows **they personally created**, not their whole tenant's data (additional narrowing beyond tenant scoping — see [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md)).

---

## 14. Mobile / responsive

- [ ] Resize to mobile width (or use a real device) for: login, lead capture form, QR scanner, business card capture, dashboard, leads list.
- [ ] Camera-dependent features (QR scan, business card photo) **must** be tested on a real device — desktop/headless preview does not reproduce the iOS Safari black-camera-preview bug (see [16-troubleshooting.md](16-troubleshooting.md)).

---

## 15. Deployment verification (after pushing any change live)

- [ ] `curl -s -o /dev/null -w "%{http_code}" https://tradeshow-agent.gtmtechsol.ai/login` → 200.
- [ ] Real login as a seeded user on the live public domain (not just the EC2 instance's local port).
- [ ] Spot-check whichever feature just changed, on the actual public domain.
- [ ] `docker logs --tail 50 tradeshow-agent` on the EC2 instance — confirm no startup errors or repeated exceptions.

Full deploy procedure: [09-deployment-guide.md](09-deployment-guide.md).

---

## What this guide does not cover

No automated test suite exists to run instead of this checklist (see [15-testing-guide.md](15-testing-guide.md) and [19-known-limitations.md](19-known-limitations.md)) — every box above is a manual action. Wildcard subdomain testing against *real* public DNS is also out of scope until DNS is actually enabled (see [wildcard-rollout-runbook.md](wildcard-rollout-runbook.md)) — section 1.2 above uses `Host` header simulation as the closest available proxy.
