# Release 14.4 — Unified Multi-ICP Targeting (Event + Campaign)

**Status: implemented, tested against an isolated database, committed. Not deployed to production. Not integrated into any agent.** Per the "Final Development Brief — R14.3.1 Hardening + Plan & Usage + R14.4 Unified Multi-ICP Targeting," which explicitly **superseded** an earlier, narrower design (Campaign-only multi-ICP, Campaign overriding Event) captured in [docs/RELEASE-14.3.1-14.4-ASSESSMENT.md](RELEASE-14.3.1-14.4-ASSESSMENT.md) — that document is kept for historical record but its Campaign-only precedence proposal (§J) is **not** what was built; this file is authoritative.

## Architectural principle

> ICP Profiles are reusable tenant assets. Events and Campaigns are targeting contexts. Both can reference multiple ICPs. Multiple ICPs are evaluated independently using OR semantics. Event targeting is more specific and therefore takes precedence over Campaign targeting, while Tenant Default ICP remains the final fallback.

```
                    TENANT
                       │
                ICP PROFILE LIBRARY
                       │
             ┌─────────┴─────────┐
             │                   │
           EVENTS             CAMPAIGNS
             │                   │
       Multiple ICPs       Multiple ICPs
             │                   │
             └──── TARGETING RESOLVER ────┘
                          │
                    ICP Evaluation (independent, OR)
```

Event and Campaign are deliberately different objects — an Event answers "where/when did we engage the prospect," a Campaign answers "which GTM initiative are we running." They can be used independently or together.

## Data model

Two new join tables (both additive, both `UNIQUE(context_id, icp_profile_id)`), plus one new entity table and two nullable FK columns:

```sql
-- 0019_event_icp_profiles.sql
CREATE TABLE event_icp_profiles (
  id UUID PK, event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  icp_profile_id UUID NOT NULL REFERENCES icp_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ, UNIQUE(event_id, icp_profile_id)
);
-- + backfill: existing events.icp_profile_id values seeded into this table

-- 0020_campaigns.sql
CREATE TYPE campaign_status AS ENUM ('draft','active','completed','archived');
CREATE TABLE campaigns (id, tenant_id, name, description, status, start_date, end_date, created_by_user_id, created_at, updated_at);
CREATE TABLE campaign_icp_profiles (id, campaign_id FK, icp_profile_id FK, created_at, UNIQUE(campaign_id, icp_profile_id));
ALTER TABLE events ADD COLUMN campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
```

`events.icp_profile_id` (R14.2) is **kept, unmodified** — not dropped, not the write target for new assignments. Per the brief's explicit instruction, it will only be retired in a later release once multi-ICP is proven out in practice.

**Campaign lifecycle is explicit, never date-derived** (`draft`/`active`/`completed`/`archived`, set only via the API) — a deliberate choice to avoid recreating the exact ambiguity the [event-status fix](RELEASE-14.3.1-HARDENING.md) just resolved.

## Backward-compatible migration (verified, not just designed)

`0019`'s backfill (`INSERT INTO event_icp_profiles SELECT id, icp_profile_id FROM events WHERE icp_profile_id IS NOT NULL`) was tested end-to-end: a tenant/ICP/event were inserted using the **pre-R14.4 pattern** (single `events.icp_profile_id`) against a database with only migrations `0001`–`0018` applied; `0019` and `0020` were then applied on top. Result — verified by direct query, not assumption:
- The join table gained exactly one row, matching that event/ICP pair.
- The original `events.icp_profile_id` value was completely untouched.
- `resolveTargetingContext()` on that same legacy event returned the correct single ICP via the **new** join-table path, proving existing targeting is preserved through the migration, not just that the column survived.

## Targeting resolver

`src/lib/icp/icp-resolver.ts` — `resolveTargetingContext(tenantId, eventId): Promise<TargetingContext | null>` is the new single entry point, extending (not replacing) the existing resolver file. `getActiveICPForEvent` (R14.3) is kept unmodified since no production agent code calls it yet.

**Resolution order — more specific wins:**
1. **Event ICPs** (`event_icp_profiles`) — if the event has any, use them. `source: "event"`.
2. **Campaign ICPs** (`campaign_icp_profiles`) — only if the event has none of its own *and* belongs to a Campaign that has ICPs. `source: "campaign"`. Campaign ICPs are never deleted or overridden by this — they simply aren't consulted while the event has its own.
3. **Tenant Default ICP** — if neither of the above resolves (must itself be `active`, same rule as R14.3). `source: "tenant_default"`.
4. **`null`** — nothing configured anywhere.

```ts
export interface TargetingContext {
  source: "event" | "campaign" | "tenant_default";
  contextId: string;
  icps: ICPContext[]; // always non-empty when returned; evaluate each independently
}
```

**OR semantics, not merged criteria:** `icps` is an array a future consumer evaluates one at a time (one `evaluateICPFitQualitative()` call per entry) — this resolver does not combine ICP configs into one giant rule or pick a "winner." That stays a future agent-layer concern (R14.5+).

**One matching engine, not four:** no `event-fit.ts`, `campaign-fit.ts`, `campaign-scoring.ts`, or `event-scoring.ts` was created. Campaign Test Mode (below) and the resolver both call the same `evaluateICPFitQualitative()` from R14.3's `fit.ts`, unmodified.

## API surface

- `POST/PATCH /api/events` — `icpProfileIds: string[]` is current; a legacy singular `icpProfileId` is still accepted (folded into a one-item array) for compatibility. `campaignId` is validated server-side the same way (`validateEventCampaignAssignment`, reusing the same `ICPTenantMismatchError` pattern as ICP assignment) and set/cleared explicitly — never passed through an unvalidated body spread.
- `/api/campaigns/*` — full CRUD/lifecycle (`route.ts`, `[id]/route.ts`, `[id]/activate`, `[id]/archive`, `[id]/icps`, `[id]/test`), mirroring `/api/icp-profiles/*` exactly: `tenant_admin`-only mutations, tenant-scoped reads, `logAudit()` on every mutation (`campaign_created`, `campaign_updated`, `campaign_activated`, `campaign_archived`, `campaign_icps_updated`), all-or-nothing cross-tenant validation.

## Campaign Test Mode

`POST /api/campaigns/:id/test` — calls `evaluateICPFitQualitative()` once per ICP assigned to the campaign (zero new matching logic), then groups by qualitative level into Primary Match / Other Matches / No Match. Same simulation-only guarantees as ICP Test Mode: `tenant_admin`-only, no numeric score, no Apollo/Gemini/workflow/CRM/opportunity/follow-up/ROI, not audited. Verified live: a campaign with one ICP whose config was empty (all criteria "Unknown") correctly returned "No strong match found" with the ICP listed under No Match — not a false positive.

## UI

- `/settings/campaigns` (list, create) and `/settings/campaigns/[id]` (edit, activate/archive, multi-select target ICPs, associated events, Test Mode) — `tenant_admin`-only, mirrors ICP Configuration's UI conventions.
- Event create form: multi-select ICP checklist (was a single dropdown) + an optional Campaign picker. When no event-level ICP is selected and a Campaign is chosen, the form shows *"Targeting inherited from '\<Campaign name>' — N ICP profile(s)."* — verified live, exact copy.
- Nav: "Campaigns" added under Settings (`tenant_admin`-only); `CURRENT_RELEASE` bumped `14.3 → 14.4` so it renders unlocked.

## Tenant isolation (verified against a live database, all four cases from the brief)

1. Tenant A cannot reference Tenant B's ICP on an Event — `setEventICPProfiles` rejects, **all-or-nothing** (confirmed the rejected call left the event's existing ICP list completely unchanged, no partial write).
2. Tenant A cannot reference Tenant B's ICP on a Campaign — `setCampaignICPProfiles` rejects the same way.
3. Tenant B cannot view or edit Tenant A's Campaign — `assertCampaignOwnedByTenant` rejects.
4. (Event → Campaign cross-tenant assignment uses the same `assertCampaignOwnedByTenant` check via `validateEventCampaignAssignment` — same code path as case 3, not a separate implementation to independently get wrong.)

## Test evidence

24-check script run against an isolated Docker Postgres with all 20 migrations applied (including the pre-migration legacy-data backfill test above), covering: OR semantics for both Event and Campaign multi-ICP, all four precedence branches (event / campaign-fallback / tenant-default / null) including the **Event-beats-Campaign** case with both simultaneously set, the legacy backfill, all four tenant-isolation cases, Campaign CRUD row shape, and event-status derivation. **All 24 passed.**

Live browser verification on top of that (same fixture data, real login, real UI): Campaign list showing correct ICP/event counts, Campaign detail page's checklist reflecting the correct assigned ICP, Associated Events listing both events correctly, Campaign Test Mode returning the correct qualitative grouping, Event creation with a Campaign selected showing the inheritance message and correctly incrementing the campaign's event count afterward (2 → 3).

One 500 error was hit during live testing — caused by leaving Start/End Date blank, which is the **already-documented, pre-existing, unrelated** bug in [docs/CURRENT-KNOWN-ISSUES.md](CURRENT-KNOWN-ISSUES.md) #6 (not introduced by this release; confirmed by inspecting the resulting stack trace, same `DateTimeParseError` root cause).

`npm run build`: clean at every commit checkpoint.

## Files changed

**New:** `drizzle/0019_event_icp_profiles.sql`, `drizzle/0020_campaigns.sql`, `src/app/api/campaigns/route.ts` + `[id]/route.ts` + `[id]/activate,archive,icps,test/route.ts`, `src/app/(app)/settings/campaigns/page.tsx` + `CampaignListClient.tsx` + `[id]/page.tsx` + `[id]/CampaignEditClient.tsx`.

**Modified:** `src/db/schema.ts` (`eventIcpProfiles`, `campaigns`, `campaignIcpProfiles`, `events.campaignId`), `src/lib/icp/icp-resolver.ts` (`getEventICPProfiles`, `setEventICPProfiles`, `getCampaign`, `assertCampaignOwnedByTenant`, `getCampaignICPProfiles`, `setCampaignICPProfiles`, `validateEventCampaignAssignment`, `resolveTargetingContext`; removed the now-superseded `validateEventICPAssignment`), `src/lib/icp/types.ts` (`TargetingContext`, `TargetingSource`), `src/app/api/events/route.ts` + `[id]/route.ts`, `src/app/(app)/events/EventsClient.tsx`, `src/lib/nav.ts`.

**Not touched:** Conversation Intelligence, Lead Scoring, Follow-Up, CRM Sync, Opportunity, ROI, Orchestrator, Gemini prompts — per the explicit agent boundary. `resolveTargetingContext()` exists and is tested but nothing calls it from agent code yet.

## Recommendation for next release

**PROCEED** to wiring `resolveTargetingContext()` into an actual agent consumer (starting with Conversation Intelligence, per the original R14 sequencing) whenever that's separately approved. No architectural rework needed — the resolver output shape (`{source, contextId, icps[]}`) was designed for exactly this.
