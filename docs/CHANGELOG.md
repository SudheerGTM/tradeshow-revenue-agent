# Changelog

All notable changes to Trade Show Revenue Agent, release by release. Dates are approximate (derived from commit history, not always exact).

> **Note added 2026-08-18:** Releases 13.7, 13.7.1, and 13.8 below shipped on branch `claude/priceless-keller-10439f`. That branch has since been reconciled into `main` via merge (`0972810`), and the reconciled code (plus documentation fixes) has been deployed to and verified in production (`864f848`) — `main`, the branch, and production are all in sync as of this update. See [PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md) for the full story.

## Release 14.4 — Unified Multi-ICP Targeting (Event + Campaign)

**Major features:** Events and Campaigns can now both target multiple ICPs (OR semantics — a lead matches if it matches *any* selected ICP), via new `event_icp_profiles`/`campaign_icp_profiles` join tables and a new `campaigns` entity (`draft`/`active`/`completed`/`archived`, explicit lifecycle, deliberately not date-derived). New unified resolver `resolveTargetingContext(tenantId, eventId)` in `src/lib/icp/icp-resolver.ts` — precedence is **Event ICPs > Campaign ICPs > Tenant Default ICP > null** (Event wins because it's the more specific context; an earlier draft had Campaign override Event, corrected before implementation). Full `/api/campaigns/*` CRUD/lifecycle mirroring `/api/icp-profiles/*` conventions exactly, plus a new `/settings/campaigns` Admin UI and a Campaign picker on event creation. Campaign Test Mode reuses `evaluateICPFitQualitative()` unchanged (zero new matching logic) and groups results into Primary/Other/No Match.

**Database changes:** `0019_event_icp_profiles.sql` (new join table + backfill of existing `events.icp_profile_id` values) and `0020_campaigns.sql` (new `campaigns`/`campaign_icp_profiles` tables + nullable `events.campaign_id`). Both additive only; `0019`'s backfill inserts new join-table rows only, no existing row modified. Specifically tested against pre-migration-shape legacy data to confirm the backfill preserves existing targeting exactly. **Not yet applied to production.**

**Breaking changes:** None. `events.icp_profile_id` (R14.2) is kept, unmodified, for backward compatibility — a tenant using only the old single-ICP pattern, or no ICP at all, resolves identically to R14.3.

**Known issues at release:** `resolveTargetingContext()` has no agent caller yet — Conversation Intelligence, Lead Scoring, Follow-Up, Opportunity, CRM Sync, ROI, and the Orchestrator are all explicitly untouched. That wiring is R14.5+. Test Mode's known substring-matching limitation (see R14.3 entry below) applies identically to Campaign Test Mode, since it's the same underlying function. Explicitly stop-gated before production deployment and before agent integration.

## Release 14.3.1 — Product Hardening, Platform Admin, Plan & Usage

**Major features:** Fixed the event-status display bug (an event mid-run showed "Upcoming" forever — `events.status` was a static value written once at creation, never revisited; root-caused, not assumed) with a new pure `deriveEventStatus()` utility (`src/lib/event-status.ts`), computed and additive — the stored `status` column and its `cancelled`/"current event" roles are untouched. New Platform Admin tenant detail page (`/admin/tenants/[tenantId]`) with Overview/Adoption/Events/Targeting/Integrations/Administration sections, reusing existing query patterns rather than duplicating KPI logic; tenant list's misleading single-"Event" column replaced with a real event count. Tenant Settings reorganized into Overview/Targeting/Platform Health/Administration (same cards, better IA, no visual redesign). "Subscription & Usage" (an explicit hardcoded placeholder) replaced with real "Plan & Usage" numbers — users, leads/AI-workflow-runs/enrichment-calls this month, storage, events, ICP profiles — backed by a lightweight entitlement model (`src/lib/plans.ts` + `tenants.plan_name`, no `plans` table, no billing engine). Enrichment usage specifically distinguishes real Apollo calls from cached reuse, using Release 13.7.1's existing `enrichment_started`/`enrichment_skipped_cached` audit actions.

**Database changes:** `0018_tenant_plan.sql` — one `NOT NULL DEFAULT`-backfilled `tenants.plan_name` column. Purely additive. **Not yet applied to production.**

**Breaking changes:** None.

**Known issues at release:** None new. All Plan & Usage numbers verified real (not fabricated) against live seed data before release.

## Release 14.3 — Configurable ICP Administration

**Major features:** Full ICP Admin UI (`/settings/icp`, `tenant_admin`-only) — list/create/edit/clone/activate/deactivate profiles across all 5 `ICPConfigSchema` sections with tag-style multi-value inputs (no raw JSON exposed); `/api/icp-profiles/*` CRUD/lifecycle routes; explicit tenant **Default ICP** concept (`tenants.default_icp_profile_id`) replacing R14.2's "exactly one active profile = implicit default" rule — a tenant may now have multiple simultaneously-active profiles, with one optionally marked Default via `PATCH /api/icp-profiles/default`; event create/edit now offers an ICP picker (explicit profile or "use tenant default"), server-side-validated via the existing `validateEventICPAssignment()`; qualitative-only **ICP Test Mode** (`POST /api/icp-profiles/:id/test`) — sample-input → matched/missing/negative/unknown criteria, no numeric score, built by extending the existing shared `src/lib/icp/fit.ts` rather than a separate scoring engine, so it can't diverge from a future real Lead Scoring integration the way two competing implementations could.

**Database changes:** `0017_icp_default_profile.sql` — one nullable `tenants.default_icp_profile_id` column + index. Purely additive; no existing row modified. **Not yet applied to production** (bundled with the still-pending `0016` migration — see `docs/ICP-ARCHITECTURE.md`).

**Breaking changes:** None. A tenant with no ICP profiles and no default set resolves identically to pre-R14.3 behavior (`null` context, unchanged consumer behavior).

**Known issues at release:** No agent yet reads a resolved `ICPContext` — Conversation Intelligence, Lead Scoring, Follow-Up, Opportunity, CRM Sync, and ROI all still use fixed/hardcoded defaults, unchanged since R14.2. That wiring starts at R14.4. Scoring weights remain present in the config schema but inert, with no UI to edit them (unchanged decision from R14.2). Test Mode's pain-point/buying-signal matching is literal substring matching, not semantic — see `docs/ICP-ARCHITECTURE.md` for the specific limitation. Explicitly stop-gated before R14.4 — not started.

**Deployment:** Deployed to production 2026-08-21 (commit `fec78eb`), replacing `864f848`. Migrations `0016`/`0017` applied cleanly. Functionally re-verified live against a real production tenant. Found one pre-existing, unrelated bug during verification: `POST /api/events` 500s if Start/End Date are left blank (the form has always sent `""` rather than `null` — not introduced by R14.2/R14.3) — see [CURRENT-KNOWN-ISSUES.md](CURRENT-KNOWN-ISSUES.md) #6.

---

## Release 14.2 — Configurable ICP Foundation

**Major features:** `icp_profiles` table (tenant-scoped, Zod-validated `configuration_json`), nullable `events.icp_profile_id`; `src/lib/icp/icp-resolver.ts` as the single ICP-reading entry point (`getICPProfile`, `getActiveICPForEvent`, `getICPConfiguration`, `getICPVersion`, `validateICPConfiguration`, `validateEventICPAssignment`); fixed a real duplicate-logic bug where `src/lib/agents/lead-scoring.ts` and `src/components/lead-detail/CompanyIntelTab.tsx` each independently hardcoded a slightly different logistics-industry keyword list — both now share `src/lib/icp/fit.ts`.

**Database changes:** `0016_icp_profiles.sql` — new table `icp_profiles`, new enum `icp_status`, new nullable `events.icp_profile_id` column. Purely additive; no existing row modified. **Not yet applied to production** — see `docs/ICP-ARCHITECTURE.md` for the migration plan, gated on separate approval.

**Breaking changes:** None. `getActiveICPForEvent()` returns `null` for every tenant today (zero ICP profiles exist anywhere yet) — every consumer's behavior is unchanged. Verified via a full migration-and-resolver test run against an isolated database, plus a live browser check of the refactored Company Intelligence tab.

**Known issues at release:** No ICP Admin UI or API route exists yet — `events.icp_profile_id` can only be set via direct database access today. Scoring weights are present in the config schema but inert (not read by any scoring logic, not exposed in any UI) per the R14.2 approval decision. Explicitly stop-gated before R14.3 (Admin UI), R14.4 (Conversation Intelligence), R14.5 (Lead Scoring), R14.6 (Follow-Up) — none of that work has started.

---

## Release 13.8 — Controlled Tenant Self-Registration & Provisioning

**Major features:** Public `/request-access` form (honeypot spam field, IP/user-agent capture, no auth required) for prospective tenants to request access; `platform_admin` review queue at `/admin/access-requests` (approve/reject with notes); on approval, an idempotent `Tenant Provisioning Agent` automatically creates the tenant (slug/subdomain derived from company name, collision-suffixed), an optional default event, and a `tenant_admin` invitation (same 7-day-expiry email-link mechanism as regular invitations) — all inside one DB transaction, with emails sent afterward so a delivery failure never rolls back a successful provision.

**Database changes:** `0015_tenant_access_requests.sql` — new table `tenant_access_requests`, new enum `access_request_status` (requested/under_review/approved/rejected/provisioned).

**Breaking changes:** None.

**Known issues at release:** Confirmed deployed to production via live SSH (2026-08-18) — `tradeshow-agent:be05540` running, `/request-access` present in the compiled build. That same check revealed production is separately missing the S3/Transcribe instance-role fix from a later merge — see `docs/CURRENT-KNOWN-ISSUES.md` #1.

---

## Release 13.7.1 — Workflow Idempotency, Data Integrity & Cost Optimization

**Major features:** Re-running the Agent Orchestrator for a lead that already has an active CRM-sync job or follow-up draft now **refreshes it in place** instead of creating a duplicate row (`upsertPendingCRMSyncJob()`, `upsertDraftFollowup()`) — completed/failed/approved/rejected records are left untouched as history. Apollo enrichment skips a redundant paid API call when a usable (`enriched`) result already exists for the lead, logged as `enrichment_skipped_cached`; the manual "Refresh Enrichment" button always still calls Apollo via an explicit `forceRefresh` flag. CRM Sync now fails with a clear, actionable "HubSpot isn't connected" message instead of a raw env-var error, surfaced as a banner in the CRM Sync panel before Approve is even clicked (`GET /api/crm-sync/status`).

**Database changes:** None.

**Breaking changes:** None.

**Bug fixes:** Included a small production hotfix (`7e2376c`, "CRM Sync fails gracefully when HubSpot isn't connected") verified live against a real pending sync job in production.

---

## Release 13.7 — Engineering Stabilization & Tenant-Scoped Authentication

**Major features:** Login/mobile UI polish. **Tenant-scoped subdomain authentication** — Phase 0 of the wildcard multi-tenant rollout: `resolveTenantSlug()` (`src/lib/tenant.ts`) now correctly distinguishes the apex domain from a real tenant subdomain (a prior version incorrectly treated the bare apex as a tenant with slug `tradeshow-agent`); `getTenantBySubdomain()` added, querying the `tenants.subdomain` column specifically (distinct from `tenants.slug`); `src/proxy.ts` (this Next.js fork's `middleware.ts` equivalent) forwards the resolved slug as a header + cookie on every request, only setting the cookie for an actual subdomain; `authorize()` in `src/lib/auth.ts` enforces tenant-subdomain matching when a subdomain is used, while preserving today's tenant-agnostic apex-domain login unchanged (wildcard DNS isn't live yet, so the apex remains the only entry point real users have).

**Database changes:** None.

**Breaking changes:** None — the new enforcement only activates when a real tenant subdomain is used, which isn't publicly reachable until wildcard DNS is enabled (see `docs/wildcard-rollout-runbook.md`).

**Known issues at release:** Wildcard SSL/Nginx/DNS (Phases 1–3 of the rollout) prepared but not executed, pending separate approval and GoDaddy DNS access.

---

## Release 13.6 — Identity, Access Management & User Adoption

**Major features:** Email-based invitations (`user_invitations` table, 7-day token expiry, no `users` row until accepted); self-service + admin-initiated password reset via secure single-use email links; account lockout after 5 failed logins; 5-state user lifecycle (invited/active/inactive/suspended/locked); password history + reuse prevention (last 5); per-user event access scoping; 5-step onboarding wizard; Security Dashboard (`/settings/security`); User Adoption dashboard section; expanded audit logging with IP address capture.

**Database changes:** `0014_iam.sql` — new tables `password_history`, `user_invitations`, `user_event_access`, `password_reset_tokens`; `users` gains `failedLoginAttempts`, `lockedAt`, `lastLoginAt`, `lastActivityAt`, `sessionCount`, `avatarUrl`, `allEvents`, `onboardingStep`, `onboardingCompletedAt`; `audit_logs` gains `ipAddress`; `user_status` enum extended with `invited`/`suspended`/`locked`.

**Breaking changes:** `PATCH /api/users/:id` no longer accepts a raw `password` field — admin password resets now go through the email-link flow. Invited users have no `users` row until they accept (anything that assumed a user row exists immediately on invite would break).

**Bug fixes:** Fixed `session.user.id` never being populated by NextAuth callbacks (silently writing `NULL` to `created_by_user_id`/audit `user_id` everywhere) — see [16-troubleshooting.md](16-troubleshooting.md).

**Known issues at release:** AWS SES in sandbox mode (only `info@gtmtechsol.com` can receive real email); an unexplained password drift on `admin@demo.com` in production was found and worked around but not root-caused; dashboard N+1 query performance issue pre-existing, not addressed by this release.

---

## Release 13.5 — Quick Capture (QR Badge Scan + Business Card OCR)

**Major features:** Quick Capture hub on `/leads/new` (Scan Badge QR / Scan Business Card / Manual Entry); client-side QR decoding (`jsqr`) with a vCard/MECARD/JSON/query-param fallback parser chain; business card photo capture + Gemini Vision OCR with a mandatory human-review step before any data is trusted; duplicate lead detection (email or name+company match) with a resolution modal; permanent business-card image storage (S3 + DB record) with consent capture; dashboard adoption metrics (QR scans, card scans, quick-capture vs. manual leads, average capture time).

**Database changes:** `0013_quick_capture.sql` — new table `business_card_images`; `leads` gains `qrRawText`, `qrScannedAt`, `captureDurationSeconds`; `lead_source` enum gains `qr_badge_scan`; new enums `ocr_status`, `ocr_review_status`.

**Breaking changes:** None.

**Bug fixes (post-release):** Fixed a black/frozen camera preview on iOS Safari specifically (stream attached before the conditionally-mounted `<video>` element existed in the DOM) — see [16-troubleshooting.md](16-troubleshooting.md).

**Known issues at release:** None new; inherited the pre-existing AWS Transcribe subscription gap.

---

## Release 13 — Agent Orchestrator & Workflow Engine

**Major features:** Chains all six pipeline agents (Conversation Intelligence, Enrichment, Lead Scoring, Follow-Up, CRM Sync, ROI) into one "Lead Qualification Workflow" per lead; `AgentAdapter` interface as an explicit seam for a future AWS Step Functions/Bedrock AgentCore swap; retry logic with failure classification (temporary/validation/permission) and exponential backoff; in-process event bus; configurable agent policies (e.g. score thresholds gating CRM sync).

**Database changes:** `0012_orchestrator.sql` — new tables `agent_registry`, `workflow_runs`, `agent_executions`, `agent_policies`, with seed data for all six agents and three example policies.

**Breaking changes:** None.

**Known issues at release:** Orchestrator runs synchronously in-process (no queue/worker) — acceptable at current scale, flagged as a future scaling concern.

---

## Release 12 — Trade Show ROI Analytics & Executive Reporting

**Major features:** Deterministic per-event ROI calculation (cost, pipeline, ROI%, cost-per-lead/qualified-lead/opportunity); AI executive summary layered on top of the computed numbers (never recalculates, falls back to a deterministic template if Gemini is unavailable); PDF and Excel export (tenant_admin only).

**Database changes:** `0011_event_roi.sql` — new tables `event_costs`, `event_roi_metrics`.

---

## Release 11 — Opportunity & Pipeline Intelligence Agent

**Major features:** Kanban-style opportunity pipeline, stage-based close probabilities, opportunity activity log.

**Database changes:** `0010_opportunities.sql` — new tables `opportunities`, `opportunity_activities`.

---

## Release 10 — CRM Sync Agent

**Major features:** HubSpot integration — prepare → human approval → sync, never automatic. Duplicate detection against existing HubSpot contacts/companies.

**Database changes:** `0009_crm_sync_jobs.sql` — new table `crm_sync_jobs`.

---

## Release 9 — Follow-Up Intelligence Agent

**Major features:** AI-drafted follow-up messages (email/LinkedIn/meeting/call script) based on lead classification — drafts only, no send capability exists.

**Database changes:** `0008_followup_recommendations.sql` — new table `followup_recommendations`.

---

## Release 8 — Lead Scoring Agent

**Major features:** Deterministic 100-point scoring model (Company Fit/Authority/Need/Urgency/Engagement/Data Quality) with AI-generated explanation layered on top — AI explains, never sets, the score.

**Database changes:** `0007_lead_scores.sql` — new table `lead_scores`.

---

## Release 7 — Apollo Enrichment Agent

**Major features:** Company and contact enrichment via Apollo.io, two-step contact lookup to work around a deprecated endpoint.

**Database changes:** `0006_enrichment.sql` — new tables `company_enrichment`, `contact_enrichment`.

---

## Release 6 — Conversation Intelligence Agent (Gemini)

**Major features:** AI extraction of pain points, urgency, business need, and next-best-action from conversation transcripts/notes.

**Database changes:** `0005_conversation_insights.sql` — new table `conversation_insights`.

---

## Release 5 — Amazon Transcribe transcription service

**Major features:** Async speech-to-text for recorded voice notes.

**Database changes:** `0004_transcripts.sql` — new table `transcripts`.

**Known issues at release:** AWS account was never subscribed to Transcribe — this gap has persisted through every subsequent release.

---

## Releases 1–4 — Foundation

**Major features:** Project scaffold, multi-tenant + RBAC user management, lead capture (manual + public QR form), voice note recording and S3 upload.

**Database changes:** `0001_initial.sql` (tenants, users, audit_logs), `0002_events_leads.sql` (events, leads), `0003_voice_notes.sql` (voice_notes).
