# Performance Review

Findings from direct code inspection. Per Release 13.7 scope, this is documentation only — no fixes applied here unless explicitly noted as already-safe.

## Critical

### Dashboard ROI recalculation N+1 (confirmed, previously flagged)

`src/app/(app)/dashboard/page.tsx:387-400` loops over every event belonging to the tenant and calls `recalculateAndStoreROI(ev.id, tenantId, session.user.id)` **sequentially, with `await` inside the loop**:

```ts
const tenantEvents = await db.select(...).from(schema.events).where(eq(schema.events.tenantId, tenantId));
for (const ev of tenantEvents) {
  const { result } = await recalculateAndStoreROI(ev.id, tenantId, session.user.id);
  ...
}
```

Each call to `recalculateAndStoreROI` (`src/lib/agents/roi-agent.ts:188`) does its own `select` to check for an existing metrics row, then an `insert` or `update` — at least 2 round-trips per event, all sequential, on a route that runs on **every dashboard page load**.

- **Impact:** load time scales linearly with event count per tenant; a tenant with 20 events incurs ~40+ sequential DB round-trips before the page can render. This is also a **write** (insert/update) happening on what should be a read-heavy page — every dashboard view re-persists ROI metrics regardless of whether anything changed.
- **Recommendation:**
  1. Short-term, low-risk: run the per-event recalculation with `Promise.all(tenantEvents.map(ev => recalculateAndStoreROI(...)))` to parallelize the round-trips (the calls are independent — different `eventId`s, no shared mutable state).
  2. Better: don't recalculate-and-write on every page view. Either cache the result (short TTL) or move recalculation to a background/cron job and have the dashboard just `select` the already-stored `eventRoiMetrics` rows.
- **Effort:** (1) is a few hours; (2) is a half-day to a day including testing.
- **Risk of fixing:** Low for (1). Medium for (2) — changes when ROI numbers refresh, needs product sign-off since ROI is a guardrail-protected deterministic number (see `STATUS.md` guardrails).

## High

### Dashboard does many independent queries per load

The same `page.tsx` file issues 25+ separate `await db.select(...)` calls sequentially for unrelated stat blocks (lead status breakdown, voice notes, transcripts, conversation insights, enrichment, lead scores, follow-ups, CRM sync, opportunities, orchestrator stats, quick-capture stats, adoption stats). None of these depend on each other's results.

- **Impact:** even without the N+1 above, page load pays for ~25 sequential round-trips instead of one batch.
- **Recommendation:** group independent queries with `Promise.all`. This is safe — none of the current calls feed into each other's `where` clauses. Confirm before changing: the `isTenantAdmin` gated block (lines ~104-130) and anything after it that reads a variable set in scope.
- **Effort:** half a day, low risk if done incrementally with testing after each batch.

## Medium

### No caching layer on dashboard or list views

No evidence of `revalidate`, `unstable_cache`, or a query cache anywhere in the dashboard/lead-list code paths inspected. Every page view re-runs the full query set even when underlying data hasn't changed.

- **Recommendation:** consider Next.js route segment caching (`export const revalidate = N`) for dashboard stats that don't need to be real-time, once the N+1/sequential-query issues above are fixed first (caching a slow query just hides the problem until cache expiry).

### Recent-insights query has an unbounded-feeling limit pattern

`recentInsights` (`page.tsx` ~line 184) pulls up to 50 rows just to compute a JS-side `Object.entries(...).sort(...)` for top-5 product interests. This works fine at current scale but pushes aggregation logic that SQL could do (`GROUP BY` + `ORDER BY count DESC LIMIT 5` on the unnested array) into the application layer.

- **Recommendation:** low priority at current data volumes; worth revisiting if `conversationInsights` grows large per tenant.

## Low / Informational

- **Indexes:** spot-checked `src/db/schema.ts` — tenant-scoped tables consistently have `tenantId` indexes (e.g. `leads_tenant_idx`, `leads_status_idx` composite, `ui_tenant_idx`/`ui_status_idx` for invitations, `users_tenant_idx`). No obvious missing-index gaps found in the tables touched by the dashboard query set.
- **API response payload sizes:** not separately audited in this pass — flagged for a follow-up review once the dashboard query work above is prioritized, since that's the highest-traffic page.
- **Caching opportunities** beyond the dashboard (e.g. Apollo/HubSpot enrichment responses) are not yet evaluated — out of scope for this pass, candidate for Release 14 if API rate limits become a problem (see `docs/11-integrations.md`).

## Summary Table

| Issue | Severity | Effort | Fix now? |
|---|---|---|---|
| Sequential ROI recalc-and-write per event on every dashboard load | Critical | Few hrs (parallelize) / 0.5-1 day (cache or background) | Recommend parallelizing now, defer caching to Release 14 |
| ~25 independent sequential dashboard queries | High | 0.5 day | Yes, safe and mechanical |
| No caching layer on dashboard | Medium | TBD | Defer until above two are fixed |
| Top-5 product interest computed in JS over 50 rows | Low | Trivial | Defer, not worth the churn at current scale |
