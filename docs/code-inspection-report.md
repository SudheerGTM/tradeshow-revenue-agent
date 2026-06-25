# Code Inspection Report

A point-in-time scan of the codebase for technical debt, performed alongside the Release 13.6 documentation effort. Findings are classified by severity and include file references. This report is meant to be **acted on**, not filed away — see [19-known-limitations.md](19-known-limitations.md) for how these roll up into the broader limitations list.

## Summary

| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| Performance | 0 | 1 | 1 | 0 |
| Oversized files/components | 0 | 1 | 1 | 0 |
| Duplicate logic | 0 | 0 | 2 | 0 |
| Naming inconsistencies | 0 | 0 | 1 | 1 |
| Dead code | 0 | 0 | 0 | 1 |
| Type safety | 0 | 0 | 1 | 0 |
| Security | 0 | 0 | 0 | 0 |
| **Total** | **0** | **2** | **6** | **2** |

No Critical-severity findings. No SQL injection, hardcoded secrets, or `dangerouslySetInnerHTML` usage found. No TODO/FIXME/HACK comments exist anywhere in `src/` (a literal `"TODO"` string match was a HubSpot task-type enum value, not a comment).

## High severity

### H1 — Dashboard ROI calculation is an N+1 query loop
**File:** `src/app/(app)/dashboard/page.tsx` (around the tenant-events ROI section)
```ts
for (const ev of tenantEvents) {
  const { result } = await recalculateAndStoreROI(ev.id, tenantId, session.user.id); // awaited sequentially
  // ...accumulate stats
}
```
`recalculateAndStoreROI()` itself issues 8+ queries per call. For a tenant with 10 events, this is ~80 sequential DB round-trips on a single dashboard page load. **Fix:** `Promise.all(tenantEvents.map(ev => recalculateAndStoreROI(...)))`, or better, move the aggregation into a single SQL query at the page level.

### H2 — `src/app/(app)/dashboard/page.tsx` is 800+ lines and growing
Every release that's added a new KPI section has appended to this one file rather than extracting per-section logic. Combined with H1, this file is both a maintainability and performance hotspot. **Fix:** extract each stats section into its own server-side data-fetching function (or a dedicated `/api/dashboard/stats` endpoint), and batch independent queries with `Promise.all()`.

## Medium severity

### M1 — Sequential (non-batched) dashboard queries outside the ROI loop
The same file issues 15+ independent metric queries one after another rather than via `Promise.all()`. Not as severe as H1 (no per-event multiplication) but adds unnecessary latency to every dashboard load.

### M2 — `src/db/schema.ts` is a single 997-line file
Every table, enum, and type export for the entire application lives in one file. Functional today, but increasingly hard to navigate — a refactor into per-domain files (`schema/auth.ts`, `schema/leads.ts`, `schema/agents.ts`, etc., re-exported from an index) would help without changing any runtime behavior.

### M3 — Duplicate upload-initiation logic (~70% overlap)
**Files:** `src/app/api/voice-notes/initiate-upload/route.ts`, `src/app/api/business-cards/initiate-upload/route.ts`. Both follow an identical 8-step flow (validate → check file constraints → fetch lead via the shared `getLeadForVoiceNote` helper → create DB row with placeholder key → build real S3 key → update row → presign → audit log), differing only in allowed types, size limit, target table, and key-builder function. **Fix:** extract a generic `initiateFileUpload()` helper parameterized by those four differences.

### M4 — S3 helper functions have misleading audio-specific names
**File:** `src/lib/aws/s3.ts`. `deleteAudioFile()` is called by `business-cards/delete/route.ts` to delete *image* files — the route's own comment acknowledges this ("deleteAudioFile is generic despite the name"). `getAudioMetadata()` has the same issue, currently only used for audio but written generically. **Fix:** rename to `deleteS3Object()`/`getS3ObjectMetadata()` — purely mechanical, low risk, improves clarity for the next person who reads a business-card route and wonders why it imports an "audio" function.

### M5 — Lead-detail tabs may re-fetch data the parent already has
**File:** `src/app/(app)/leads/[id]/LeadDetailClient.tsx` and its tab components. The parent fetches score/insight/enrichment data into state, but several tabs also independently call their own `/api/` endpoints on mount — causing duplicate network requests when switching tabs. **Fix:** pass already-fetched data down as props; only let a tab fetch its own data if the parent genuinely doesn't have it yet.

### M6 — File sizes stored as `text`, not a numeric type
**File:** `src/db/schema.ts` — `voiceNotes.fileSizeBytes`, `businessCardImages.fileSizeBytes` are `text` columns (comment: "stored as text to avoid bigint friction"), requiring `String()`/`parseFloat()` conversions on every write/read. Works, but a `bigint` or `integer` column would be cleaner and Drizzle handles bigint without the friction the original comment anticipated. Low risk to fix, but touches a migration.

## Low severity

### L1 — One likely-temporary file: `src/lib/mockActivity.ts`
Used only by `src/components/admin/UserDrawer.tsx` (`mockLastActive`), explicitly a placeholder pending a real `last_login` column. **Note:** `users.lastLoginAt` now exists (added in Release 13.6) — this mock may already be partially obsolete; worth checking whether `UserDrawer.tsx` should be updated to use the real column instead of the mock helper.

### L2 — Mixed `is*`/`can*` naming in permission helpers
**File:** `src/lib/permissions.ts` — `isPlatformAdmin`/`isTenantAdmin`/`isManager` (predicate style) vs. `canAssignRole` (action style). Both are readable and in active use; not worth a forced rename, but worth being deliberate about which style fits a new helper before adding one.

## Explicitly checked and found clean

- **SQL injection:** every `sql\`...\`` template literal sampled interpolates via `${column}`, never raw string concatenation of user input.
- **Hardcoded secrets:** none found in source; everything sensitive is `process.env.*`.
- **Tenant-scoping:** sampled `/api/leads`, `/api/users`, `/api/business-cards` — all consistently filter by `tenantId` from the session.
- **`dangerouslySetInnerHTML`:** zero usages.
- **Error response consistency:** all sampled routes return `{ error: string }` with an appropriate status code.
- **TODO/FIXME/HACK comments:** none in `src/`.

## How to use this report

Re-run this scan periodically (or before a major release) rather than treating it as a one-time snapshot — severity and findings will shift as the codebase grows. If you fix an item, remove it from this file in the same PR and add a one-line note to [CHANGELOG.md](CHANGELOG.md) rather than letting this report silently go stale.
