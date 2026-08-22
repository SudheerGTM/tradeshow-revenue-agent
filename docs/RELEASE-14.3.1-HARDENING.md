# Release 14.3.1 — Product Hardening, Platform Admin, Plan & Usage

**Status: implemented, tested against an isolated database, committed, and deployed to production (2026-08-22, commit `8287357`).** Per the "Final Development Brief — R14.3.1 Hardening + Plan & Usage + R14.4 Unified Multi-ICP Targeting," approved after the assessment in [docs/RELEASE-14.3.1-14.4-ASSESSMENT.md](RELEASE-14.3.1-14.4-ASSESSMENT.md). See [RELEASE-14.4-UNIFIED-TARGETING.md](RELEASE-14.4-UNIFIED-TARGETING.md) for the Event/Campaign multi-ICP work that shipped alongside this, and [Production deployment report](#production-deployment-report-2026-08-22) below.

## Event status fix

**Root cause:** `events.status` (`upcoming`/`active`/`completed`/`cancelled`) was a plain stored column, written once at creation and never revisited — no date-comparison logic existed anywhere. An event with dates in the past still showed "Upcoming" because nothing had ever changed the stored value.

**Fix — additive, zero migration** (the assessment's "Option 1"): [`src/lib/event-status.ts`](../src/lib/event-status.ts) exports `deriveEventStatus(startDate, endDate, now)`, a pure function comparing ISO date strings (inclusive both ends, timezone-safe since there's no time-of-day component and no local-offset arithmetic involved) — returns `"upcoming" | "ongoing" | "completed" | null`. `getEventDisplayStatus()` wraps it: the stored `status === "cancelled"` always overrides the computed label; everything else is date-derived. This is the single function every display site calls (`EventsClient.tsx`, `CurrentEventCard.tsx`, `EventReportClient.tsx`) — no competing implementation exists.

**What was deliberately preserved:** the stored `events.status` column and its dual role (lifecycle override for `cancelled`, and the tenant's "current event" lookup in `settings/tenant/page.tsx` via `status = "active"`) are completely untouched. The computed label is purely presentational.

## Platform Admin — Tenant Management

- Tenant list's `Event` column (a free-text label unrelated to the real `events` table) replaced with a real `Events` count via a `LEFT JOIN ... GROUP BY` aggregation.
- New `/admin/tenants/[tenantId]` detail page: Overview (name/slug/subdomain/status/created/plan/tenant admin/last activity), Adoption (users, leads, qualified leads, opportunities, pipeline/expected revenue — reusing the exact query shapes from the tenant's own Settings page and Dashboard), Events (with computed status + assigned-ICP count), Targeting (Default ICP, ICP Profile counts), Integrations (explicitly labeled as platform-wide, not per-tenant — see below), Administration (existing activate/deactivate, reused not reimplemented).
- **Integration status is a global env var, not per-tenant** — confirmed by inspection, not assumed. Every tenant sees identical Apollo/Gemini/HubSpot/S3 connected state; only the activity timestamps genuinely vary per tenant. The new UI states this explicitly rather than implying a per-tenant credential that doesn't exist.

## Tenant Settings — reorganized IA

Same cards, regrouped into Overview / Targeting / Platform Health / Administration per the approved brief — no visual redesign. Targeting gained a small summary (Default ICP, ICP Profile counts, link to `/settings/icp`) that didn't exist on this page before.

## Plan & Usage

Replaced the explicit hardcoded placeholder (`SubscriptionPlaceholderCard` — its own comment said *"no billing/usage backend exists yet, values are illustrative"*) with real numbers.

**Model:** [`src/lib/plans.ts`](../src/lib/plans.ts) — a typed config object (`PLANS.trade_show_pro`), not a `plans` table (the assessment's recommended smallest option). One additive column, `tenants.plan_name` (migration `0018_tenant_plan.sql`, `NOT NULL DEFAULT 'trade_show_pro'`). Informational only — nothing is enforced or blocked.

**Real vs. computed metrics** (all verified against a live isolated database, not just code-reviewed):
| Metric | Source |
|---|---|
| Users | `count(*) from users where tenant_id = ...` |
| Leads this month | `leads.created_at >= <month start>`, tenant-scoped |
| AI Workflow Runs this month | `workflow_runs.created_at >= <month start>`, tenant-scoped |
| Enrichment Usage | `audit_logs.action = 'enrichment_started'` this month — a **real Apollo call**, distinct from `'enrichment_skipped_cached'` (Release 13.7.1's existing cost-control distinction), shown as a secondary "N cached reuse (not counted)" line so cached hits never inflate the count |
| Storage | `sum(cast(file_size_bytes as bigint))` across `voice_notes` + `business_card_images`, tenant-scoped |
| Events / ICP Profiles | direct counts, tenant-scoped |

Verified live: a test tenant with 1 user, 5 events, 3 ICP profiles, 0 leads/workflow-runs/enrichment-calls/storage rendered exactly `1/10`, `5/10`, `3/10`, `0/1,000`, `0/2,000`, `0/500`, `0GB/25GB` — no fabricated numbers anywhere.

## Files changed

**New:** `src/lib/event-status.ts`, `src/lib/plans.ts`, `src/components/admin/PlanUsageCard.tsx`, `src/app/(app)/admin/tenants/[tenantId]/page.tsx` + `TenantDetailClient.tsx`, `drizzle/0018_tenant_plan.sql`.

**Modified:** `src/db/schema.ts` (`tenants.planName`), `src/app/(app)/events/EventsClient.tsx`, `src/components/admin/CurrentEventCard.tsx`, `src/app/(app)/events/[id]/report/EventReportClient.tsx` (computed status badge), `src/app/(app)/admin/tenants/TenantsClient.tsx` + `page.tsx` (event count, clickable name), `src/app/(app)/settings/tenant/page.tsx` (reorg + real Plan & Usage queries).

**Deleted:** `src/components/admin/SubscriptionPlaceholderCard.tsx` (superseded, no longer referenced anywhere).

## Test evidence

- `npm run build`: clean throughout every step.
- Isolated Docker Postgres (all 20 migrations `0001`–`0020` applied in sequence, clean): `deriveEventStatus`/`getEventDisplayStatus` verified for upcoming/ongoing (both inclusive boundaries)/completed/cancelled-override/no-dates cases — see [RELEASE-14.4-UNIFIED-TARGETING.md](RELEASE-14.4-UNIFIED-TARGETING.md) for the full test run (event status was tested in the same pass as targeting).
- Live browser: Plan & Usage numbers confirmed correct against known seed data (see above); Events page badge shows "Upcoming" correctly for dateless test events (falls back to `upcoming` when neither date is set, matching the "nothing to derive" case).

---

## Production deployment report (2026-08-22)

Deployed together with R14.4 (same migration/build/cutover — one combined deployment window, per the standard practice for a release spanning both). Full step-by-step:

**1. Previous production commit:** `5f230b9` (Apollo status route). **New production commit:** `8287357`.

**2. Pre-migration baseline (verified, not assumed):** 9 tenants, 7 events, 3 ICP profiles, 16 users.

**3. Migrations applied, in order, via `psql -v ON_ERROR_STOP=1`, no errors:**
- `0018_tenant_plan.sql` — `ALTER TABLE`. Verified: tenant count still 9, all 9 rows correctly defaulted to `plan_name = 'trade_show_pro'`.
- `0019_event_icp_profiles.sql` — table + 2 indexes + backfill. `INSERT 0 2` — see [RELEASE-14.4-UNIFIED-TARGETING.md](RELEASE-14.4-UNIFIED-TARGETING.md) for the exact row-level verification.
- `0020_campaigns.sql` — enum + 2 tables + 3 indexes + `ALTER TABLE events`. Verified: `campaigns`/`campaign_icp_profiles` empty, `events.campaign_id` NULL on all 7 pre-existing events.

**4. Post-migration row counts:** tenants 9, events 7, icp_profiles 3, users 16 — **identical to baseline**. No existing row's value changed at any step.

**5. Application deployment:** `git archive` from `8287357` → `scp` → Docker build (clean) → container rename/stop/run cutover. Local health check (`curl localhost:3000/login` → 200), public health check (`curl https://tradeshow-agent.gtmtechsol.ai/login` → 200), both passed. Server logs since startup: zero errors.

**6. Functional verification, live in production (tenant_admin `admin@demo.com`, Demo Logistics):**
- **Event status fix confirmed working on real data**, not just test fixtures: "Multimodal 2026" (ended 2026-07-02, well before today) now correctly displays **"Completed"** — this event had been stuck showing "Upcoming" before this deployment, which is the exact bug this release fixed.
- **Plan & Usage** rendered real tenant-scoped numbers: Users 5/10, Events 2/10, ICP Profiles 1/10, Leads/AI-Workflow-Runs/Enrichment/Storage all correctly at 0 for the current period.
- R14.4 functional pass — see [RELEASE-14.4-UNIFIED-TARGETING.md § Production deployment report](RELEASE-14.4-UNIFIED-TARGETING.md#production-deployment-report-2026-08-22).

**7. Rollback status:** Not needed — deployment healthy throughout. Previous container preserved as `tradeshow-agent-prev-5f230b9` (stopped, not removed) for instant rollback. Database rollback not assessed/applied — all three migrations are additive and harmless per their own design.

**8. Documentation updated:** this file, `RELEASE-14.4-UNIFIED-TARGETING.md`, `STATUS.md`, `RELEASES.md`, `PROJECT-HANDOFF.md`.

**Production deployment: COMPLETE.** Agent integration (Conversation Intelligence, Lead Scoring, Follow-Up, CRM Sync, Opportunity, ROI, Orchestrator reading `resolveTargetingContext()`) remains **NOT started**, per the R14.4 brief's stop-gate — pending separate explicit approval.
