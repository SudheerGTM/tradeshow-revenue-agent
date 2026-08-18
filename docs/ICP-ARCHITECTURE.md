# ICP Architecture (Release 14.2)

Technical reference for the Configurable ICP foundation actually implemented in R14.2. For the R14.1 assessment that justified this design (current-state findings, risks, recommendation), see [RELEASE-14-CONFIGURABLE-ICP.md](RELEASE-14-CONFIGURABLE-ICP.md). This doc describes what exists in code today — update it in the same PR as any future change to `src/lib/icp/*`, per this repo's normal documentation convention ([14-coding-standards.md](14-coding-standards.md)).

## What R14.2 built

- **Data model:** one new table, `icp_profiles` (tenant-scoped, Zod-validated JSON config), plus one new nullable column, `events.icp_profile_id`.
- **Resolver:** `src/lib/icp/icp-resolver.ts` — the single place that reads these tables.
- **Config schema:** `src/lib/icp/schema.ts` — Zod validation for `configuration_json`.
- **Shared fit function:** `src/lib/icp/fit.ts` — the previously-duplicated hardcoded industry check, now defined once.
- **What consumes it today:** `src/lib/agents/lead-scoring.ts` and `src/components/lead-detail/CompanyIntelTab.tsx`, both via `src/lib/icp/fit.ts` only — **neither is ICP-context-aware yet**. That's Release 14.5 (Lead Scoring) and later phases, explicitly deferred per the R14.2 approval brief.
- **What does NOT exist yet:** any API route, any UI for creating/editing/testing ICP profiles, any AI prompt change, any weight-editing capability. See [Explicitly not built](#explicitly-not-built-yet) below.

## Data model

```
icp_profiles
  id                   uuid PK
  tenant_id            uuid → tenants (CASCADE)
  name                 varchar(255)
  description          text, nullable
  status               icp_status enum: draft | active | inactive   (default 'draft')
  version              integer                                       (default 1)
  configuration_json   jsonb, NOT NULL — validated by ICPConfigSchema before every write
  created_by_user_id   uuid → users (SET NULL)
  created_at / updated_at

events.icp_profile_id  uuid, nullable → icp_profiles (SET NULL)
  null = "resolve the tenant's implicit default instead" (see Resolution order below)
```

Indexes: `icp_profiles(tenant_id)`, `icp_profiles(tenant_id, status)`, `events(icp_profile_id)`.

Migration: `drizzle/0016_icp_profiles.sql` — additive only (one `CREATE TABLE`, one `CREATE TYPE`, one `ALTER TABLE ... ADD COLUMN`, three indexes). No existing row in any table is modified. Verified applied cleanly on top of the full `0001`–`0015` history in an isolated test database during R14.2 (see [production migration plan](#production-migration-plan) below for the real-environment rollout, not yet executed).

## Configuration schema (`src/lib/icp/schema.ts`)

`ICPConfigSchema` (Zod) validates five sections, matching the brief's terminology:

```ts
{
  companyFit: { targetIndustries, targetSubindustries, targetCountries, employeeSizeMin/Max,
                revenueRangeMin/Max, companyTypes, relevantTechnologies,
                excludedIndustries, excludedCompanyTypes, exclusions },
  personaFit: { targetDepartments, targetJobFunctions, targetTitles, targetSeniority,
                decisionMakerTitles, economicBuyerTitles, influencerTitles,
                championTitles, nonTargetPersonas },
  problemFit: { priorityPainPoints, businessChallenges, businessObjectives,
                priorityUseCases, triggerEvents },
  buyingSignals: { high, medium, negative },
  products: [{ name, description, targetPersonas, painPointsAddressed, useCases,
               keywords, valueProposition, typicalDealValue }],
  scoringWeights: { companyFit, personaFit, problemFit, buyingIntent, engagement, dataQuality }
    // must sum to exactly 100 — enforced by a Zod .refine()
}
```

**`scoringWeights` is present in the schema but inert in R14.2** — no scoring logic reads it, and no UI exposes editing it (explicit R14.2 approval decision: prove ICP criteria work across industries before introducing scoring-model customization). It's stored from day one so a future release doesn't need a breaking schema change to activate it — see `DEFAULT_SCORING_WEIGHTS` in `schema.ts`, which matches today's actual fixed lead-scoring.ts split (25/20/20/15/10/10).

`validateICPConfiguration(raw: unknown): ICPConfig` (in the resolver) is the single validation entry point — throws `ICPValidationError` with a readable message on failure. Any future API route accepting ICP config from a client must call this before persisting, never trust client-supplied JSON directly.

## Resolver (`src/lib/icp/icp-resolver.ts`)

| Function | Purpose |
|---|---|
| `getICPProfile(tenantId, profileId)` | Tenant-scoped single lookup. Returns `null` on any mismatch — never leaks another tenant's row. |
| `getICPConfiguration(profile)` | Parses + validates `profile.configurationJson`. |
| `getICPVersion(profile)` | Returns `profile.version`. |
| `validateICPConfiguration(raw)` | Throws `ICPValidationError` on invalid shape. |
| `getActiveICPForEvent(tenantId, eventId)` | The main entry point — see resolution order below. |
| `validateEventICPAssignment(tenantId, icpProfileId \| null)` | Server-side guard: throws `ICPTenantMismatchError` if the profile doesn't belong to the tenant. `null` (clearing an assignment) always passes. |

### Resolution order (`getActiveICPForEvent`)

```mermaid
flowchart TD
    Start["getActiveICPForEvent(tenantId, eventId)"] --> HasEvent{eventId given\nand has icp_profile_id?}
    HasEvent -->|yes| Lookup["Tenant-scoped lookup\nof that profile"]
    Lookup -->|found| Explicit["Return that profile's context"]
    Lookup -->|not found\n(stale/cross-tenant ref)| Fallback
    HasEvent -->|no| Fallback["Query tenant's status='active' profiles"]
    Fallback --> Count{how many?}
    Count -->|exactly 1| Implicit["Return that one profile's context\n(implicit tenant default)"]
    Count -->|0 or 2+| Null["Return null\n— no unambiguous default,\nnever guess"]
```

**Why "exactly 1 active profile = default" instead of an explicit `is_default` flag:** the R14.2-approved data model (per the brief) intentionally has no such flag — only `status: draft | active | inactive`. A tenant can have multiple simultaneously-active profiles (e.g. Freight Forwarders + Warehouse Operators, both usable, assigned individually to different events) without one of them needing to be "the" default. When exactly one is active, using it as the implicit default is unambiguous and low-risk. When more than one is active with no event-level assignment, the resolver deliberately returns `null` rather than picking one arbitrarily — this is flagged as an open question for R14.3 (the Admin UI is expected to need an explicit default-selection mechanism once tenants realistically have multiple simultaneously-active profiles).

## The "one source of truth" fix (`src/lib/icp/fit.ts`)

Before R14.2, two independent, already-diverged hardcoded keyword lists existed:
- `lead-scoring.ts`'s Company Fit bonus: `["logistics", "transport", "supply chain", "freight"]`
- `CompanyIntelTab.tsx`'s `deriveICPFit()`: `["logistics", "freight", "transport", "supply chain", "shipping", "warehous"]` (two extra keywords the scoring engine never saw)

Both now call `matchesDefaultTargetIndustry(industry)` / `deriveDefaultIndustryFit(industry)` from `src/lib/icp/fit.ts` — one function, one list, both consumers guaranteed to agree. This is a **behavior-tightening bug fix** for the UI: a company in "Shipping" or "Warehousing" used to show "Strong" industry fit in the Company Intel tab without ever getting the corresponding scoring bonus — that inconsistency is gone. Verified via a live browser check during R14.2 (see [RELEASE-14-CONFIGURABLE-ICP.md](RELEASE-14-CONFIGURABLE-ICP.md) for the test evidence).

This module is **still the fixed hardcoded default**, not yet ICP-aware — making it read from an actual `ICPContext` is Release 14.5's job.

## Backward compatibility (verified)

`getActiveICPForEvent()` returns `null` for any tenant with zero ICP profiles — which is every tenant today. No consumer changes behavior when it receives `null`; nothing currently even passes an `ICPContext` into `lead-scoring.ts` or the follow-up/conversation agents (that wiring is R14.4–R14.6). Confirmed via the R14.2 test run: a tenant with no ICP profiles resolves to `null`, and the shared fit function's output for known industries matches the pre-refactor logic exactly (see the R14.1/R14.2 verification results in [RELEASE-14-CONFIGURABLE-ICP.md](RELEASE-14-CONFIGURABLE-ICP.md)).

## Tenant isolation (verified)

- `getICPProfile()` and every other resolver read filters by `tenantId`, matching the pattern audited elsewhere in this codebase ([08-multi-tenant-architecture.md](08-multi-tenant-architecture.md)).
- `validateEventICPAssignment()` is the explicit server-side guard for the one write path that matters right now (assigning an ICP to an event) — confirmed to reject a cross-tenant assignment attempt and accept a same-tenant one, tested against a real (throwaway, isolated) database during R14.2.
- No API route or UI exists yet that lets a user actually trigger an event→ICP assignment through the product — `events.icp_profile_id` can currently only be set via direct DB/script access (by design; wiring this into `POST/PATCH /api/events` is expected with the Admin UI, R14.3).

## Production migration plan

**Not executed. Requires separate explicit approval before running against the real production RDS instance**, per the R14.2 brief's Migration Safety section.

1. Confirm current production `events` row count and integrity (`SELECT count(*) FROM events;` — purely informational, read-only) before touching anything.
2. Apply `drizzle/0016_icp_profiles.sql` via the existing manual process (`psql -h <rds-endpoint> ... -f drizzle/0016_icp_profiles.sql`, from the EC2 instance per [09-deployment-guide.md](09-deployment-guide.md) — RDS isn't reachable directly from a local machine).
3. Confirm afterward: `\d events` shows the new nullable `icp_profile_id` column with no default and no NOT NULL constraint; every existing `events` row has `icp_profile_id IS NULL`; `\d icp_profiles` exists and is empty.
4. No application redeploy is strictly required to just apply this migration (nothing in the currently-deployed code reads these new columns/table yet) — but the new code (`src/lib/icp/*`, the `lead-scoring.ts`/`CompanyIntelTab.tsx` changes) does need deploying separately, following the normal deploy process. Recommend applying the migration and deploying the code together in one deploy, not as two separate steps, to avoid a window where the column exists but the deployed code doesn't know about it (harmless either order, but simpler to reason about as one step).
5. Rollback, if ever needed: `DROP TABLE icp_profiles CASCADE;` then `ALTER TABLE events DROP COLUMN icp_profile_id;` — safe, since nothing references these yet in production and no data has been written to them by real usage.

## Explicitly not built yet

Per the R14.2 stop-gate — do not infer these exist:
- ICP Admin UI (R14.3)
- Any `/api/icp-profiles/*` route
- Conversation Intelligence ICP-awareness (R14.4)
- Lead Scoring / Follow-Up actually reading `ICPContext` (R14.5 / R14.6)
- ICP Test Mode (R14.7)
- Weight editing of any kind
