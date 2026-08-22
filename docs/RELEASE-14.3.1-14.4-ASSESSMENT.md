# Release 14.3.1 Hardening + Tenant Admin Improvements + R14.4 Campaign/Multi-ICP Foundation — Assessment

> **Superseded 2026-08-22.** This assessment's R14.3.1 sections (A–E) were implemented as designed — see **[docs/RELEASE-14.3.1-HARDENING.md](RELEASE-14.3.1-HARDENING.md)**. Its R14.4 sections (F–S) proposed a **Campaign-only** multi-ICP design (Campaign overrides Event ICP) that was explicitly superseded before implementation by a follow-up brief: Events *also* gained multi-ICP support, and the precedence was corrected to **Event ICPs > Campaign ICPs** (more specific wins), not the reverse. What was actually built is documented in **[docs/RELEASE-14.4-UNIFIED-TARGETING.md](RELEASE-14.4-UNIFIED-TARGETING.md)** — treat that file as authoritative for R14.4, not §F–S below. This document is kept for historical record of the reasoning that led there.

**Assessment only. No implementation had been done at the time this was written.** This was the required output of the "R14.3.1 Hardening + R14.4 Campaign/Multi-ICP Foundation" brief's Phase A — current-state inspection and proposed architecture, for explicit user approval before any code was written.

Compiled 2026-08-22 against `main` (`7e1a9e0`) by direct code inspection (four parallel read-only investigations), not inference.

## Current-state inspection (per brief §A)

- `git status`: clean except two pre-existing unrelated uncommitted files (`.claude/launch.json`, `src/components/VoiceRecorder.tsx` — flagged in [docs/CURRENT-KNOWN-ISSUES.md](CURRENT-KNOWN-ISSUES.md) #5, not touched) and the untracked `ChatGPT - Prompts/` folder (source docs, intentionally not committed).
- `git branch --show-current`: `main`.
- `git log --oneline -15`: HEAD `7e1a9e0` (Apollo status route deployment doc) → `5f230b9` (Apollo status route) → `2687ce5`/`fec78eb` (R14.3 deployment) → `aa66376`/`14605a2` (R14.2) → S3/Transcribe hotfix/reconciliation history.
- `git worktree list`: `main` worktree at `7e1a9e0` (this one); a second worktree on branch `claude/priceless-keller-10439f` is stale at `aa66376` (7 commits behind) — not used for development this session per prior explicit instruction to work in the `main` folder directly.
- `npm run build`: clean, exit 0.

---

## A. Event status root cause

**Root cause, confirmed by direct inspection — not a timezone/off-by-one bug. There is no date-derivation logic at all.**

`events.status` (`src/db/schema.ts:179,191`) is a plain stored enum — `eventStatusEnum = pgEnum("event_status", ["upcoming", "active", "completed", "cancelled"])`, `NOT NULL DEFAULT 'upcoming'`. It is written **once**, at creation (`POST /api/events`, `src/app/api/events/route.ts:72-75`, never includes `status` in the insert, so it silently takes the schema default), and never revisited automatically — no cron job, DB trigger, generated column, or date-comparison exists anywhere (`PATCH /api/events/[id]` can change it, but only via an explicit client request nothing currently sends). An event created 2026-08-01→2026-08-31 simply still holds `"upcoming"` on 2026-08-22 because nothing has ever told it otherwise.

Display is duplicated in two places with copy-pasted color maps: `src/app/(app)/events/EventsClient.tsx:14-16` (`STATUS_COLORS`) and `src/components/admin/CurrentEventCard.tsx:16-18` (`STATUS_VARIANT`), both reading the raw stored value. `EventReportClient.tsx:102` and `src/app/api/events/[id]/report/route.ts:46` pass it through raw too.

**A real complication the brief doesn't mention:** `status` is not purely cosmetic today. `src/app/(app)/settings/tenant/page.tsx:83` queries `eq(schema.events.status, "active")` to find "the tenant's current event" for the dashboard's `CurrentEventCard`. So `"active"` is currently doing double duty — a stand-in for "happening now" *and* an implicit "this is the one event highlighted as current" flag. Any fix must not break that lookup.

**Two options, recommending Option 1:**

- **Option 1 (recommended) — zero migration, additive only.** Add `src/lib/event-status.ts` exporting `deriveEventStatus(startDate, endDate, now = new Date()): "upcoming" | "ongoing" | "completed"`, a pure date-comparison function (inclusive both ends, per the brief's spec), plus a shared `EVENT_STATUS_COLORS` map. Every display site (`EventsClient.tsx`, `CurrentEventCard.tsx`, `EventReportClient.tsx`) renders this computed badge as the primary visible status. The stored `status` column is left completely untouched — its values and the `"active"` "current event" lookup keep working exactly as today; `"cancelled"` continues to override display (if `status === "cancelled"`, show "Cancelled" instead of the computed badge). Fixes the reported bug immediately, no migration, no risk to the current-event lookup. Downside, stated plainly: the stored `"active"`/`"upcoming"`/`"completed"` enum values become effectively dead weight for *display* purposes (only `"cancelled"` and the "current event" flag role remain meaningful) — a little conceptually untidy, worth a code comment explaining why.
- **Option 2 (bigger, not recommended now)** — split the concept properly: add a new `events.is_current boolean` column (backfilled from `status = 'active'` in the same migration) to replace the "current event" flag role, freeing `status` to be redefined as a pure lifecycle enum (`draft | active | cancelled | archived`, matching the brief §4's Administration language) with no `upcoming`/`completed` values at all. Real migration, backfill risk, touches `settings/tenant/page.tsx`'s query. Matches the brief's language ("Keep date-derived status separate from lifecycle states... Draft, Active, Cancelled, Archived") more literally, but is materially more work and risk for a bug-fix release. Flagging as a future option, not proposing it now.

---

## B. Platform Admin tenant gaps

Confirmed gaps, all real:

- **Tenant list** (`src/app/(app)/admin/tenants/TenantsClient.tsx:72-78`) shows Name, Slug, Subdomain, **Event**, Status, Created. `Event` (line 87, `t.eventName ?? "—"`) is **not** a relation or count — `eventName` is a plain free-text `varchar(255)` set once at tenant creation, unrelated to the real `events` table. It cannot reflect "3 events" because it was never designed to; it's a label, not an aggregation. Fixing this means adding a real event-count query, not just renaming a column header.
- **No tenant detail view exists at all.** No `/admin/tenants/[id]` or similar route anywhere in `src/app`. Confirmed via full directory search.
- `GET /api/tenants` (`src/app/api/tenants/route.ts:9-21`) does a flat, unjoined `db.select().from(schema.tenants)` — no event counts today; would need a new aggregation (either a join+group-by or a per-tenant subquery).
- **Reusable metric patterns already exist**, tenant-scoped, in two places worth copying rather than reinventing: `settings/tenant/page.tsx:49-79` (Users, Events, Leads Captured, Qualified Leads via `selectDistinctOn` on hot/warm scores, Open Opportunities, Pipeline Value via `sum(amount)`, plus a composite Tenant Health score at lines 125-146) and the deeper per-tenant metrics in `dashboard/page.tsx:59-439`. Both use the same Drizzle idioms (`sql<number>\`count(*)::int\``, `eq(tenantId)`, `selectDistinctOn` for latest-per-lead) — a new tenant-detail page should reuse these query shapes with the route param swapped in for `session.user.tenantId`.
- **Integration status is global, not per-tenant** — `settings/tenant/page.tsx:167-171`'s `integrations` array checks `process.env.APOLLO_API_KEY` etc., identical for every tenant. A Platform Admin "per-tenant integration status" view will show the *same* connected/disconnected state for every tenant, with only the "Last Sync"/"Last AI Request" activity timestamp genuinely varying. Worth stating explicitly in the new UI's copy so it doesn't read as a per-tenant credential that isn't real.
- **Activate/deactivate already fully exists** — self-contained in `TenantsClient.tsx:16-29` (`handleToggle`) calling `PATCH /api/tenants/[id]`. A new detail page should call the same endpoint, not reimplement it.

---

## C/D. Tenant Settings current implementation & real-vs-hardcoded usage values

Current page structure (`settings/tenant/page.tsx:242-302`), in order: PageHeader → Team Performance KPI grid → CurrentEventCard → (TenantHealthCard + QuickActionsPanel) → (IntegrationsStatusCard + RecentActivityCard) → **SubscriptionPlaceholderCard** → tenant-details card.

`SubscriptionPlaceholderCard.tsx` (44 lines) is an explicit, self-labeled placeholder — its own comment says *"no billing/usage backend exists yet. Values are illustrative."* It hardcodes plan name `"Trade Show Pro"` (only occurrence in the codebase), renewal date `"1 Jan 2027"`, and three fake usage rows (`3/10` users, `128/1,000` leads, `1.2GB/25GB` storage) — all string literals, none computed.

Per-metric reality check:

| Metric | Status | Notes |
|---|---|---|
| Users | **Real** | Already counted, `page.tsx:49`. No "max" concept exists anywhere — would come from the new plan model (§E). |
| Leads this month | **Real, needs new query** | `leads.createdAt` exists; current query is all-time, not month-filtered — trivial `gte(createdAt, monthStart)` addition. |
| Storage | **Partial** | `business_card_images`/`voice_notes` both have `fileSizeBytes` (stored as `text`, "to avoid bigint friction" per its own comment) — no SUM query exists yet; would need a new aggregate with a cast. |
| AI Workflow runs | **Partial** | `workflow_runs` table exists; `dashboard/page.tsx:420-426` already counts by status but not monthly, and no dedicated Agent Health/usage page aggregates this today. |
| Enrichment usage (real vs cached) | **Real, already distinguished** | `enrichment-agent.ts:44/59` logs `enrichment_skipped_cached` vs `enrichment_started` as separate `auditLogs.action` values (Release 13.7.1 cost-control) — exactly the real-vs-cached split the brief asks for, already queryable. |
| Events | **Real** | Already counted, `page.tsx:50`. |
| ICP Profiles | **Real** | `icp_profiles` is tenant-scoped and indexed; no count query yet, trivial to add. |
| Campaigns | N/A yet | Would exist once §G ships. |

**No plan/entitlement/limit concept exists anywhere** — no `plan` column on `tenants`, no `plans` table, no hardcoded limits config file. Confirmed by full-codebase search.

## E. Proposed entitlement/usage model

Smallest structured model that satisfies the brief's "do not build full billing" instruction and its own suggestion ("a lightweight internal entitlement/config model is sufficient"):

```ts
// src/lib/plans.ts — no new table, just a typed config
export const PLANS = {
  trade_show_pro: {
    label: "Trade Show Pro",
    maxUsers: 10, monthlyLeadLimit: 1000, monthlyWorkflowLimit: 2000,
    enrichmentLimit: 500, storageLimitGB: 25, eventLimit: 10,
    icpProfileLimit: 10, campaignLimit: 5,
  },
} as const;
```
Plus one additive column: `tenants.plan_name varchar(50) NOT NULL DEFAULT 'trade_show_pro'` — lets a tenant be assigned a (currently single) named plan without a `plans` table, and can grow into a real table later (`plan_name` still works as the lookup key, no breaking change). Platform Admin's tenant detail page (§B) computes real usage and compares it against `PLANS[tenant.planName]` — informational only, no enforcement, matching the brief's explicit "do not block usage" instruction.

---

## F. Existing ICP architecture to reuse (confirmed exact signatures)

- `src/lib/icp/icp-resolver.ts`: `getICPProfile(tenantId, profileId)`, `getActiveICPForEvent(tenantId, eventId): Promise<ICPContext | null>`, `assertICPProfileOwnedByTenant(tenantId, icpProfileId)` (throws `ICPTenantMismatchError`), `validateEventICPAssignment`, `setTenantDefaultICP`, `deactivateICPProfile`.
- `src/lib/icp/fit.ts`: `evaluateICPFitQualitative(config: ICPConfig, sample: ICPTestSampleInput): ICPQualitativeMatch` — pure function (no DB/network), `ICPQualitativeMatch = { overall: "Strong"|"Moderate"|"Weak"|"Unknown", criteria: ICPCriterionMatch[] }`.
- `events.icpProfileId` / `tenants.defaultIcpProfileId`: both nullable UUID FKs to `icp_profiles`, `onDelete: "set null"`, indexed.
- `src/app/api/icp-profiles/` route shape (`route.ts`, `[id]/route.ts`, `[id]/{activate,deactivate,clone,test}/route.ts`, `default/route.ts`) and its exact `logAudit()` call shape are the direct template for the new `src/app/api/campaigns/` routes.
- **Confirmed zero existing "campaign" concept anywhere** — no table, route, component, or nav entry (one unrelated hit: a CRM-picker dropdown option literally named "ActiveCampaign"). Clean-slate addition.

## G. Campaign schema

```sql
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'completed', 'archived');

CREATE TABLE campaigns (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               VARCHAR(255) NOT NULL,
  description        TEXT,
  status             campaign_status NOT NULL DEFAULT 'draft',
  start_date         DATE,
  end_date           DATE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_tenant_idx ON campaigns (tenant_id);
```
Matches the brief's suggested fields exactly and the existing `icp_profiles` table's shape/conventions.

## H. Campaign ↔ ICP relationship

Join table, no duplication of ICP config into Campaign records (per the brief's explicit instruction):
```sql
CREATE TABLE campaign_icp_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  icp_profile_id UUID NOT NULL REFERENCES icp_profiles(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, icp_profile_id)
);
```
Every write validates `icp_profile_id` via the existing `assertICPProfileOwnedByTenant()` before insert — a Campaign can only ever reference its own tenant's ICPs, enforced the same way event-ICP assignment already is.

## I. Event ↔ Campaign relationship

One additive nullable column: `events.campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL`, indexed — identical pattern to `events.icp_profile_id`. Existing explicit event-ICP assignment is **not** removed or overwritten; both columns coexist (§J covers precedence).

## J. Multi-ICP OR resolution

New resolver function, `resolveTargetingContext(tenantId, eventId): Promise<TargetingContext | null>`, added alongside `getActiveICPForEvent` in `icp-resolver.ts` (same tenant-scoped pattern):

```
1. event.campaignId set?
   → look up campaign, get all its ICPs via campaign_icp_profiles (active ones only,
     same "must be active" rule as tenant-default resolution) → return them all,
     source: "campaign"
2. else event.icpProfileId set?
   → return [that ICP], source: "event"
3. else tenant.defaultIcpProfileId set (and active)?
   → return [that ICP], source: "tenant_default"
4. else → null
```
**Precedence when both a Campaign and an explicit Event ICP are set: Campaign wins** (per the brief's stated order, Campaign ICPs → Explicit Event ICP → Tenant Default → null). The event-level ICP becomes dormant while a campaign is assigned, rather than being cleared — reversible by unassigning the campaign. **This needs explicit sign-off** (§S) since it's a real, if currently inert, behavior decision — the event-edit UI should say so plainly ("This event uses its Campaign's ICPs; the individually-assigned ICP is not used while a Campaign is set") rather than silently going dormant.

Per-ICP evaluation stays independent (§12 of the brief) — `resolveTargetingContext` returns an array of ICP references; nothing merges their criteria into one combined config. A future consumer (R14.5+) calls `evaluateICPFitQualitative`/the real scorer once per returned ICP and picks a Primary Match, exactly as §20 of the brief describes for later agent context — not built now.

## K. Backward compatibility

Every existing tenant/event continues to resolve exactly as today: `campaign_id` defaults `NULL` on every existing row (additive column), so step 1 above is always skipped for pre-existing events and resolution falls through to the unchanged event-ICP → tenant-default → null chain already shipped in R14.3. No existing query, page, or behavior changes for a tenant that never creates a Campaign — matches the brief's explicit "Preserve Simple Mode" requirement (§15).

## L. Tenant isolation

New checks needed, mirroring R14.3's proven pattern exactly:
- `assertCampaignOwnedByTenant(tenantId, campaignId)` — new, same shape as `assertICPProfileOwnedByTenant`.
- Every `campaign_icp_profiles` write validates the ICP via the *existing* `assertICPProfileOwnedByTenant` — a Campaign A cannot reference Tenant B's ICP.
- `validateEventCampaignAssignment(tenantId, campaignId | null)` — new, same shape as `validateEventICPAssignment`, wired into `POST/PATCH /api/events` alongside the existing ICP check.
- All `/api/campaigns/*` routes: `tenant_admin`-only for mutations, tenant-scoped reads, following the identical auth pattern already in every `/api/icp-profiles/*` route.
- Test plan (§P) explicitly covers all three cross-tenant rejection cases the brief lists in §21.

## M. Migration plan

One additive migration, `drizzle/0018_campaigns.sql`: `CREATE TYPE campaign_status`, `CREATE TABLE campaigns`, `CREATE TABLE campaign_icp_profiles`, `ALTER TABLE events ADD COLUMN campaign_id ...`, plus indexes. A second, `drizzle/0019_tenant_plan.sql`, adds `tenants.plan_name` (§E) — kept separate since it's conceptually unrelated to Campaigns. Both: no existing row modified, nullable/defaulted columns only. Per the brief's explicit stop-gate, **neither will be applied to any database, including the isolated test container, until this assessment is approved** — testing happens only after approval, exactly as R14.2/R14.3 did it.

## N. UI changes

1. **Event status badge** — computed `deriveEventStatus()` output shown wherever event status renders today (§A, Option 1).
2. **Platform Admin tenant list** — `Event` column → `Events` count; tenant name becomes a link to the new detail page.
3. **New `/admin/tenants/[id]`** — Overview, Adoption (reusing existing KPI query patterns), Events (with date-derived status + assigned ICP/Campaign), ICP summary, Integrations (with the "global, not per-tenant" caveat stated in the UI), Administration (existing activate/deactivate, existing user list).
4. **Tenant Settings reorganization** — regroup existing cards into Overview / Targeting (Default ICP + Active ICPs + Campaigns) / Platform Health (Integrations + Tenant Health + Recent Activity) / Administration (Users + Security + Plan & Usage), per the brief's suggested IA. No visual redesign of the cards themselves.
5. **`SubscriptionPlaceholderCard` → `PlanUsageCard`** — same slot in `page.tsx` (line 275), real numbers per §E/§C-D, progress bars with the brief's stated thresholds (0–69% normal, 70–89% approaching, 90–99% near limit, 100%+ over — informational styling only, nothing blocked).
6. **New `/settings/campaigns`** (+ `[id]` edit) — list/create/edit/activate/deactivate, multi-select ICP checklist ("A prospect may match any selected ICP"), associated-events view, optional Test Mode (§18 — defer if it adds too much complexity, per the brief's own allowance).
7. **Event create/edit** — new "Campaign" picker alongside the existing ICP picker, with the dormant-while-campaign-set copy from §J.
8. **Nav** — new "Campaigns" item under Settings, `tenant_admin`-only, next `CURRENT_RELEASE` bump (`src/lib/nav.ts`).

## O. Files expected to change

**New:** `src/lib/event-status.ts`, `src/lib/plans.ts`, `drizzle/0018_campaigns.sql`, `drizzle/0019_tenant_plan.sql`, `src/app/api/campaigns/route.ts` + `[id]/route.ts` + `[id]/activate/route.ts` + `[id]/deactivate/route.ts` + `[id]/icps/route.ts` + `[id]/test/route.ts` (if kept), `src/app/(app)/settings/campaigns/page.tsx` + `[id]/page.tsx` + client components, `src/app/(app)/admin/tenants/[id]/page.tsx` + client component, `src/components/admin/PlanUsageCard.tsx`.

**Modified:** `src/db/schema.ts` (campaigns, campaign_icp_profiles, `events.campaignId`, `tenants.planName`), `src/lib/icp/icp-resolver.ts` (`resolveTargetingContext`, `assertCampaignOwnedByTenant`, `validateEventCampaignAssignment`), `src/app/api/events/route.ts` + `[id]/route.ts` (accept/validate `campaignId`), `src/app/(app)/events/EventsClient.tsx`, `src/components/admin/CurrentEventCard.tsx`, `src/app/(app)/events/[id]/report/EventReportClient.tsx` (computed status badge), `src/app/(app)/admin/tenants/TenantsClient.tsx`, `src/app/api/tenants/route.ts` (event-count aggregation), `src/app/(app)/settings/tenant/page.tsx` (reorg + PlanUsageCard swap), `src/lib/nav.ts`.

**Not touched:** Conversation Intelligence, Lead Scoring, Follow-Up, CRM Sync, Opportunity, ROI, Orchestrator — confirmed no code path in any of these currently reads ICP/Campaign context, so the agent boundary (brief §19) is achievable without touching integration code, same as R14.3.

## P. Test plan

No automated suite exists in this repo (established pattern) — matches R14.2/R14.3's validation approach:
1. `npm run build` clean, always.
2. Isolated-database script: event-status derivation (upcoming/ongoing/completed date cases + cancelled override), Campaign CRUD + lifecycle, campaign↔ICP join tenant-isolation (cross-tenant campaign view/modify/assign rejected; campaign→ICP cross-tenant reference rejected), `resolveTargetingContext` precedence (all 4 cases: campaign set / event-ICP-only / tenant-default-only / none), Plan & Usage real-number spot checks against known seed data.
3. Live browser click-through once implemented: tenant detail page, reorganized Tenant Settings, Campaign create→assign-ICPs→activate→assign-to-event, Campaign Test Mode if built, cross-tenant rejection via forged IDs (same technique used for R14.3's production verification).
4. Regression: confirm a tenant with zero Campaigns behaves identically to pre-this-release (§K).

## Q. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Event status stored enum becomes conceptually confusing once display no longer reads it (Option 1, §A) | Low-Medium | Explicit code comment on the enum explaining the split; flagged here for user sign-off rather than silently accepted |
| Campaign-overrides-Event-ICP precedence (§J) could surprise a tenant_admin who forgets a campaign is assigned | Medium | Explicit UI copy stating the dormant-ICP behavior; needs explicit user approval, not just a default |
| This brief bundles three fairly distinct efforts (event-status fix, Platform Admin/Tenant Settings/Plan&Usage, Campaign) into one release | Medium | Recommend sequencing as separable steps (§R) so each can ship/verify independently rather than one large diff |
| New Storage/AI-workflow usage aggregates run against tables that grow over time (`business_card_images`, `voice_notes`, `workflow_runs`, `audit_logs`) | Low | Scope aggregate queries to the current billing month with proper date-indexed `WHERE`, not full-table scans |
| Campaign Test Mode (§18) adds real complexity for a "nice to have" | Low | Brief explicitly allows deferring it if so — recommend deferring to a fast-follow if the core Campaign CRUD + resolver takes longer than expected |

## R. Implementation sequence

1. Event status fix (§A, Option 1) — isolated, zero migration, ships independently.
2. Plan config model + real Plan & Usage numbers (§E) — small, one optional column.
3. Platform Admin tenant list fix + new tenant detail page (§B) — read-only, no schema change.
4. Tenant Settings reorganization (§N.4) — UI-only.
5. Campaign schema + resolver + CRUD APIs (§G-M) — the one real migration, biggest single chunk.
6. Campaign Administration UI (§N.6).
7. Event ↔ Campaign UI wiring (§N.7).
8. Campaign Test Mode (§18) — build if straightforward, defer otherwise.
9. Tenant-isolation test pass (§L/P).
10. Regression/build validation.
11. Documentation (§23 of the brief).

## S. Recommendation

**PROCEED WITH CONDITIONS.** No architectural blocker found — every piece reuses an existing, already-verified pattern (tenant-scoped CRUD, the R14.3 resolver/audit/isolation conventions, the same qualitative fit function). Three things need your explicit sign-off before coding starts, since each is a real decision rather than a default I should silently pick:

1. **Event status fix approach** — Option 1 (zero-migration computed badge, recommended) vs. Option 2 (schema split, bigger/later). 
2. **Campaign-vs-Event-ICP precedence** — Campaign wins, event ICP goes dormant while a campaign is assigned (§J) — confirm this is the intended behavior.
3. **Plan model** — the lightweight `src/lib/plans.ts` config + one `tenants.plan_name` column (§E), not a full `plans` table — confirm this is the right scope for now.

Complexity/dependency estimate: **Medium-Large** — no new architectural concepts, but real surface area across three work streams (event-status utility, Platform Admin + Tenant Settings + Plan&Usage, Campaign entity + resolver + Admin UI). Recommend the sequencing in §R so it can land and verify incrementally rather than as one release.

---

## STOP GATE

Per the brief: do not change schema, write migrations, change agents, implement Campaign, change Plan limits, deploy, or push until this assessment is approved.

**R14.3.1 assessment: READY**
**Plan & Usage design: READY**
**R14.4 Campaign architecture: READY**
**Agent changes proposed: NONE**
**Production changes made: NONE**
**Awaiting approval: YES**
