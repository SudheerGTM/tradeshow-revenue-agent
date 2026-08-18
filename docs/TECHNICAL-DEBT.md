# Technical Debt

Code-quality and architecture debt — things that work correctly today but cost more than they should to maintain or extend. For live operational/functional issues (broken integrations, unconfirmed deploy state, infra gaps), see [CURRENT-KNOWN-ISSUES.md](CURRENT-KNOWN-ISSUES.md) instead. Source material: `docs/code-inspection-report.md` (point-in-time code scan) and `docs/19-known-limitations.md`, reclassified here into a severity scheme for prioritization. **Not fixed as part of this documentation pass** — per this handoff's own instructions, documenting debt is not the same as clearing it.

## Critical

None identified. The code-inspection scan found no SQL injection risk, no hardcoded secrets, no `dangerouslySetInnerHTML` usage, and consistent tenant-scoping across every sampled route.

## High

### H1 — No automated test suite
**Where:** Entire repository. **Why it matters:** Every change is verified manually (`npm run build` + browser click-through) — see [15-testing-guide.md](15-testing-guide.md). This has already allowed at least one real regression class (the `session.user.id` null bug, live for an unknown period before being caught) to ship undetected. As the codebase grows, manual regression coverage will not scale with it.
**Fix direction:** Not a quick fix — needs a decision on framework (Vitest fits a Next.js/TS stack well) and where to start (the deterministic scoring/ROI functions in `src/lib/agents/*` are the highest-value, lowest-effort place to begin, since they're pure functions with no external API calls to mock).

### H2 — No migration runner
**Where:** `drizzle/*.sql`, applied by hand via `psql`, in numeric order, to every environment separately. **Why it matters:** Real drift has already happened once — a branch was missing an entire release's migration relative to `main` (see `docs/16-troubleshooting.md`). Every new environment (or every new session picking up stale local state) repeats the same manual-application risk.
**Fix direction:** `db:generate`/`db:push` already exist as `package.json` scripts but aren't the applied source of truth — wiring `drizzle-kit migrate` in as the actual applied mechanism, backfilled against the existing hand-applied history, would close this gap. Non-trivial because it touches the deploy process across every environment at once.

### H3 — Dashboard ROI calculation is a sequential N+1 query loop
**Where:** `src/app/(app)/dashboard/page.tsx`. **Why it matters:** `recalculateAndStoreROI()` runs in a per-event sequential loop, each call issuing 8+ queries — ~80 sequential round-trips for a 10-event tenant, on every dashboard load. See [CURRENT-KNOWN-ISSUES.md](CURRENT-KNOWN-ISSUES.md) #10 for the live-impact framing of the same issue.
**Fix direction:** `Promise.all()` the per-event calls at minimum; a single batched SQL aggregation is the better long-term fix.

### H4 — `src/app/(app)/dashboard/page.tsx` is 800+ lines and growing
**Where:** Same file as H3. **Why it matters:** Every release that's added a KPI section has appended to this one file rather than extracting per-section logic — it's now both the biggest maintainability hotspot and the biggest performance hotspot in the app simultaneously.
**Fix direction:** Extract each stats section into its own server-side data-fetching function (or a dedicated `/api/dashboard/stats` endpoint), batching independent queries with `Promise.all()` as part of the same refactor as H3.

## Medium

### M1 — Dashboard issues 15+ additional non-batched queries outside the ROI loop
Same file as H3/H4, compounding effect. Fix alongside H3/H4 rather than separately.

### M2 — `src/db/schema.ts` is a single 997+-line file
Every table/enum/type for the whole app lives in one file. Functional, but increasingly hard to navigate. A refactor into per-domain files (`schema/auth.ts`, `schema/leads.ts`, `schema/agents.ts`, `schema/tenant-access.ts`, etc., re-exported from an index) would help without changing runtime behavior. Growing faster than expected — Release 13.8 alone added a full new table (`tenant_access_requests`) to the same file.

### M3 — Duplicate upload-initiation logic (~70% overlap)
`src/app/api/voice-notes/initiate-upload/route.ts` and `src/app/api/business-cards/initiate-upload/route.ts` follow an identical 8-step flow, differing only in allowed types/size limit/target table/key-builder. Extract a generic `initiateFileUpload()` helper parameterized by those four differences — becomes more urgent if a third upload type is ever added (e.g. tenant logos).

### M4 — S3 helper functions have misleading audio-specific names
`deleteAudioFile()`/`getAudioMetadata()` in `src/lib/aws/s3.ts` are used generically (including for business-card images) despite the name. Purely mechanical rename (`deleteS3Object()`/`getS3ObjectMetadata()`) — low risk, improves clarity.

### M5 — Lead-detail tabs may re-fetch data the parent already has
`src/app/(app)/leads/[id]/LeadDetailClient.tsx` and its tab components: the parent fetches score/insight/enrichment into state, but several tabs independently re-fetch on mount. Pass already-fetched data down as props; only let a tab fetch its own data if the parent genuinely doesn't have it.

### M6 — File sizes stored as `text`, not a numeric type
`voiceNotes.fileSizeBytes`/`businessCardImages.fileSizeBytes` are `text` columns (original rationale: "avoid bigint friction"), requiring `String()`/`parseFloat()` conversion on every read/write. A `bigint` column is cleaner and Drizzle handles it fine today — low risk to fix, but touches a migration.

### M7 — No CI/CD pipeline
Every deploy is a manual SSH/SCP/Docker sequence from a developer's laptop (see [09-deployment-guide.md](09-deployment-guide.md)). No automated build-on-push, no automated rollback, no gate requiring `npm run build`/`npm run lint` to pass before merge.

## Low

### L1 — `src/lib/mockActivity.ts` is likely obsolete
Used only by `UserDrawer.tsx` as a placeholder pending a real `last_login` column — `users.lastLoginAt` now exists (Release 13.6). Worth checking whether the mock is still needed.

### L2 — Mixed `is*`/`can*` naming in permission helpers
`src/lib/permissions.ts` mixes predicate-style (`isPlatformAdmin`) and action-style (`canAssignRole`) naming. Both are readable and in active use — not worth a forced rename, but be deliberate about which style fits a new helper.

### L3 — `agent_policies.agentName` is a plain string, not a foreign key
Nothing in the database prevents a policy row referencing a nonexistent `agent_registry.agentName`. Low risk given policies are seed-only today with no edit UI, but would matter if a policy-management UI is ever built.

### L4 — No `.env.example`
Onboarding a new developer requires someone handing them a populated `.env.local` or reconstructing it from [12-environment-variables.md](12-environment-variables.md). Cheap to fix (`docs/ONBOARDING.md` on this branch already documents the full variable list — an `.env.example` with placeholder values would be a quick follow-up).

## Explicitly checked and found clean (don't re-audit these without new evidence)

- SQL injection — all `sql\`...\`` usage interpolates via `${column}`, never string-concatenates user input.
- Hardcoded secrets — none found; everything sensitive is `process.env.*`.
- Tenant-scoping — consistently applied across every sampled route.
- `dangerouslySetInnerHTML` — zero usages.
- Error response shape — consistent `{ error: string }` + appropriate status code across sampled routes.
