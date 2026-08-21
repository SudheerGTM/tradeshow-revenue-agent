# ICP Architecture (Release 14.2 + 14.3)

Technical reference for the Configurable ICP foundation and administration layer actually implemented. For the assessments that justified these designs, see [RELEASE-14-CONFIGURABLE-ICP.md](RELEASE-14-CONFIGURABLE-ICP.md) (R14.1/R14.2) and [RELEASE-14.3-ICP-ADMIN.md](RELEASE-14.3-ICP-ADMIN.md) (R14.3). This doc describes what exists in code today — update it in the same PR as any future change to `src/lib/icp/*`, per this repo's normal documentation convention ([14-coding-standards.md](14-coding-standards.md)).

## What's built

- **Data model:** `icp_profiles` (tenant-scoped, Zod-validated JSON config), nullable `events.icp_profile_id`, and (R14.3) nullable `tenants.default_icp_profile_id`.
- **Resolver:** `src/lib/icp/icp-resolver.ts` — the single place that reads/writes these tables.
- **Config schema:** `src/lib/icp/schema.ts` — Zod validation for `configuration_json`.
- **Shared fit module:** `src/lib/icp/fit.ts` — both the R14.2 hardcoded-default industry check *and* (R14.3) the qualitative Test Mode matcher. One file, one source of truth for "how do we determine ICP fit," growing incrementally rather than fragmenting.
- **Admin UI (R14.3):** `/settings/icp` (list) and `/settings/icp/[id]` (edit + Test Mode), `tenant_admin`-only.
- **API routes (R14.3):** full CRUD/lifecycle under `/api/icp-profiles/*`, plus event-assignment wiring in the existing `/api/events` routes.
- **What consumes ICP config today:** nothing agent-side yet. `lead-scoring.ts` and `CompanyIntelTab.tsx` still only use `fit.ts`'s fixed hardcoded default, **not** a resolved `ICPContext` — that's Release 14.5 and later, explicitly deferred. R14.3 is purely a configuration/administration layer on top of R14.2's data model.

## Data model

```
icp_profiles
  id                   uuid PK
  tenant_id            uuid → tenants (CASCADE)
  name                 varchar(255)
  description          text, nullable
  status               icp_status enum: draft | active | inactive   (default 'draft')
  version              integer                                       (default 1, bumped on configuration_json change only)
  configuration_json   jsonb, NOT NULL — validated by ICPConfigSchema before every write
  created_by_user_id   uuid → users (SET NULL)
  created_at / updated_at

events.icp_profile_id          uuid, nullable → icp_profiles (SET NULL)
  null = "resolve the tenant's Default ICP instead" (see Resolution order below)

tenants.default_icp_profile_id uuid, nullable → icp_profiles (SET NULL)   -- Release 14.3
  the tenant's explicit default, distinct from icp_profiles.status
```

Indexes: `icp_profiles(tenant_id)`, `icp_profiles(tenant_id, status)`, `events(icp_profile_id)`, `tenants(default_icp_profile_id)`.

Migrations: `drizzle/0016_icp_profiles.sql` (R14.2) + `drizzle/0017_icp_default_profile.sql` (R14.3) — both additive only, no existing row modified in either. Verified applied cleanly on top of the full migration history in an isolated test database, twice (once per release). **Neither has been applied to production RDS** — see [Production migration plan](#production-migration-plan).

## Configuration schema (`src/lib/icp/schema.ts`)

Unchanged since R14.2 — `ICPConfigSchema` (Zod) validates five sections: Company Fit, Persona Fit, Problem Fit, Buying Signals, Products, plus an inert `scoringWeights` (present in the schema for forward compatibility, **still not read by any scoring logic and still not exposed in any UI** — R14.3's admin UI deliberately does not include a weight-editing control, per the explicit R14.3 approval decision). See [RELEASE-14-CONFIGURABLE-ICP.md](RELEASE-14-CONFIGURABLE-ICP.md) for the full field list.

## Resolver (`src/lib/icp/icp-resolver.ts`)

| Function | Purpose |
|---|---|
| `getICPProfile(tenantId, profileId)` | Tenant-scoped single lookup. Returns `null` on any mismatch. |
| `getICPConfiguration(profile)` | Parses + validates `profile.configurationJson`. |
| `getICPVersion(profile)` | Returns `profile.version`. |
| `validateICPConfiguration(raw)` | Throws `ICPValidationError` on invalid shape. |
| `getActiveICPForEvent(tenantId, eventId)` | The main entry point — see resolution order below. |
| `assertICPProfileOwnedByTenant(tenantId, icpProfileId)` | **(R14.3)** Shared ownership check — throws `ICPTenantMismatchError`, returns the profile. Used by both event assignment and default assignment. |
| `validateEventICPAssignment(tenantId, icpProfileId \| null)` | Thin wrapper over the above for event assignment. `null` (clearing) always passes. |
| `setTenantDefaultICP(tenantId, icpProfileId \| null)` | **(R14.3)** Sets/clears `tenants.default_icp_profile_id`, validating ownership first. |
| `deactivateICPProfile(tenantId, icpProfileId)` | **(R14.3)** Deactivates a profile; if it was the tenant's default, clears the default pointer too (see below). |

### Resolution order (`getActiveICPForEvent`) — updated in Release 14.3

```mermaid
flowchart TD
    Start["getActiveICPForEvent(tenantId, eventId)"] --> HasEvent{eventId given\nand has icp_profile_id?}
    HasEvent -->|yes| Lookup["Tenant-scoped lookup\nof that profile"]
    Lookup -->|found| Explicit["Return that profile's context"]
    Lookup -->|not found\n(stale/cross-tenant ref)| Fallback
    HasEvent -->|no| Fallback["Read tenant.default_icp_profile_id"]
    Fallback --> HasDefault{set, and profile\nstatus = active?}
    HasDefault -->|yes| Default["Return that profile's context"]
    HasDefault -->|no| Null["Return null\n— no ICP context"]
```

**This replaces R14.2's original rule** ("exactly one active profile = implicit default"). Per the R14.3 approval: *"Active ≠ Default. A tenant can have multiple active ICP profiles because different events may target different audiences. Separately define a Default ICP for events without an explicit assignment."* Concretely:

- A tenant can have any number of simultaneously-**active** profiles (each individually assignable to specific events) without ambiguity.
- Exactly one of them may additionally be marked as the tenant's **Default** — a separate, explicit pointer (`tenants.default_icp_profile_id`), not inferred from status.
- If the designated default is later deactivated, `deactivateICPProfile()` automatically clears the pointer, so the resolver never has to reason about a deactivated default — confirmed by test (`resolver returns null after deactivating the default`).
- `null` is still not an error — every consumer must treat it as "no ICP configured, use today's default behavior."

## The "one source of truth" module (`src/lib/icp/fit.ts`)

Two capabilities live here, deliberately kept in one file rather than split into competing implementations:

1. **`deriveDefaultIndustryFit` / `matchesDefaultTargetIndustry`** (R14.2) — the hardcoded default industry check, shared by `lead-scoring.ts` and `CompanyIntelTab.tsx`. Fixed the pre-R14.2 bug where those two had independently-diverged keyword lists.
2. **`evaluateICPFitQualitative`** (R14.3) — ICP Test Mode's matcher. Per the explicit R14.3 approval ("do not build a separate numeric preview/scoring engine"), this was added to the *existing* shared module rather than a new `preview.ts`. It compares a sample lead-like input against one ICP profile's `configuration_json` and returns **qualitative** (`matched` / `missing` / `negative` / `unknown`) criteria only — no score, no points, no weighted formula, so it cannot drift out of sync with a future numeric Lead Scoring integration the way two competing scoring engines could.

Both remain **the fixed/configured default** — no agent currently resolves an `ICPContext` and passes it into scoring or Conversation Intelligence. That wiring is Release 14.5+.

### Test Mode matching — known limitation

`evaluateICPFitQualitative`'s text-based criteria (pain points, buying signals) use literal substring matching against the sample's free-text notes, not semantic/NLP matching. E.g. a configured signal `"requested demo"` will match `"they requested demo access"` but not `"they requested a demo"` (the word "a" breaks the contiguous substring). This is an intentional simplicity tradeoff for a "lightweight qualitative preview" — flagged explicitly here rather than discovered later. Revisit if Test Mode's false-negative rate turns out to matter in practice.

## Backward compatibility (verified, both releases)

- R14.2: `getActiveICPForEvent()` returns `null` for any tenant with zero ICP profiles (every tenant before this was used). No consumer behavior changes when it receives `null`.
- R14.3: the same holds with the new default-pointer logic — a tenant that never sets a default (the case for every tenant immediately after the R14.3 migration) resolves exactly as if R14.3 didn't exist. Re-verified via a fresh 22-check test run against an isolated database after the R14.3 changes.

## Tenant isolation (verified)

- Every resolver function is tenant-scoped from the caller's session, never client input.
- `assertICPProfileOwnedByTenant()` is the single ownership check reused by both event assignment and tenant-default assignment — confirmed to reject cross-tenant profiles and accept same-tenant ones.
- `PATCH /api/icp-profiles/default`, all `/api/icp-profiles/*` CRUD routes, and the event assignment paths in `/api/events` and `/api/events/:id` are all `tenant_admin`-gated (exact role match — **not** `platform_admin`, which per the R14.3 approval has no ICP ownership role) and tenant-scoped.
- `POST /api/events` and `PATCH /api/events/:id` previously accepted `icpProfileId` implicitly via a blind body spread (a latent gap, not exploited) — both now explicitly extract and validate it via `validateEventICPAssignment()` before it reaches the database.

## Test Mode — verified simulation-only (R14.3)

Per the R14.3 approval's explicit requirements, all confirmed via a live run against the real API, real UI, and real database:
- **No numeric score** — output is qualitative criteria only (✓ matched / △ unknown / ✗ missing or negative), matching the exact format specified in the approval.
- **`tenant_admin`-only** — the route and UI both enforce this.
- **Not audited** — confirmed by querying `audit_logs` after a real Test Mode run: zero new rows, while the same session's create/edit/activate/set-default actions each logged exactly one row as expected.
- **Zero business records created** — confirmed by row-count checks on `leads`, `lead_scores`, `crm_sync_jobs`, `opportunities`, `followup_recommendations` before/after.
- **Calls nothing external** — `evaluateICPFitQualitative()` is a pure function (no DB access, no fetch); the route only reads the target profile, no writes.

## Production migration plan

**Not executed. Requires separate explicit approval before running against the real production RDS instance.**

1. Confirm current production `events`/`tenants` row counts (read-only) before touching anything.
2. Apply `drizzle/0016_icp_profiles.sql` **then** `drizzle/0017_icp_default_profile.sql`, in that order, via the existing manual process from the EC2 instance (RDS isn't reachable directly from a local machine — see [09-deployment-guide.md](09-deployment-guide.md)).
3. Confirm afterward: `icp_profiles` exists and is empty; `events.icp_profile_id` and `tenants.default_icp_profile_id` both exist, nullable, and every existing row has them `NULL`.
4. Deploy the R14.2 + R14.3 application code in the same window as the migrations, for the same reasoning as before (avoid a window where columns exist but deployed code doesn't know about them — harmless either order, simpler to reason about together).
5. Rollback, if ever needed: `ALTER TABLE tenants DROP COLUMN default_icp_profile_id;` then `DROP TABLE icp_profiles CASCADE;` then `ALTER TABLE events DROP COLUMN icp_profile_id;` — safe, since nothing references these in production yet.

## Explicitly not built yet

Per the R14.3 stop-gate — do not infer these exist:
- Conversation Intelligence, Lead Scoring, Follow-Up, Opportunity, CRM Sync, ROI, or the Orchestrator actually reading/using an `ICPContext` (R14.4–R14.8)
- Scoring-weight editing of any kind
- Multi-ICP scoring against the same lead
- Any change to `lead-scoring.ts`'s or `CompanyIntelTab.tsx`'s actual scoring/fit logic beyond the R14.2 dedup fix
