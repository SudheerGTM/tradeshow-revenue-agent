# Current Known Issues

Point-in-time snapshot compiled 2026-08-18, verified by direct inspection of the codebase, git history, and (where accessible) production — not carried over unchecked from prior docs. See [PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md) for how this fits into the overall picture and [TECHNICAL-DEBT.md](TECHNICAL-DEBT.md) for code-quality debt specifically (this file is about live operational/functional issues; that one is about code that works but should be improved).

## Production deployment

### 1. S3/Transcribe instance-role credential fallback — RESOLVED (deployed & verified), with an important correction
**Severity:** Was flagged Critical; downgraded on investigation — see below. **Status: Resolved and verified live in production, commit `864f848`.**

**What was originally found:** Production ran commit `be05540` — the tip of `claude/priceless-keller-10439f` *before* it was reconciled with `main` — whose compiled `src/lib/aws/s3.ts`/`transcribe.ts` still had the old unconditional `credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,...}` pattern (confirmed by direct inspection of the running container's compiled chunks). This pattern produces an invalid credential object when those env vars are unset, which is what the documented architecture calls for in production (instance-role only).

**Correction found during hotfix verification:** Production's actual `.env.production` has a real, non-empty, static `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` pair (an `AKIA...`-prefixed IAM user key) — contradicting the "no static keys, instance-role only" architecture documented in [10-aws-infrastructure.md](10-aws-infrastructure.md). Since that key is present and valid, the *old* code's unconditional credential-object construction would have built a **valid** credentials object from it — meaning uploads were very likely **not actually failing** at the time this was first flagged as a live incident. The original claim overstated current impact; it was based on static code-pattern analysis without checking the actual runtime env-var state. The underlying code bug was real (and matches a genuine June 2026 outage described in `06df6d8`'s original commit message), just not necessarily active *right now* in the way first assessed.

**Fix deployed and verified regardless — this was still the right thing to do:**
- Deployed commit `864f848` (main reconciliation merge `0972810` + doc-reconciliation commit, containing zero Release 14 ICP code) to production, replacing `be05540`.
- Verified the EC2 instance role itself resolves valid, genuine temporary (STS) credentials directly (tested with the static key env vars cleared for that one process).
- Verified full authenticated business-card and voice-note upload flows end-to-end in production (logged in as a real tenant user) — `initiate-upload` → S3 `PUT` → `complete-upload`, both confirmed visible in the lead's UI afterward, then cleaned up as test artifacts.
- Zero new errors in container logs since the new container started; general smoke test (login, dashboard, tenant/lead pages) all clean.

**New open item from this investigation (see issue #2 below):** the static AWS key in production wasn't removed — that's a separate decision for the user, not bundled into this hotfix.

**Rollback if ever needed:** the previous container is preserved, stopped but not deleted, as `tradeshow-agent-prev-be05540` on the EC2 host — `docker stop tradeshow-agent && docker rename tradeshow-agent tradeshow-agent-broken && docker rename tradeshow-agent-prev-be05540 tradeshow-agent && docker start tradeshow-agent`.

### 2. Static AWS access key present in production `.env.production` — NEW, needs a decision
**Severity:** Medium (security/architecture debt, not a functional bug — everything works either way) · **Impact:** Production isn't actually relying on the EC2 instance role day-to-day, despite that being the documented, intended, more secure design (no static long-lived keys to leak/rotate). The instance role is confirmed correctly configured and fully functional as of this session.
**Workaround:** None needed — nothing is broken. This is a "clean up now that we've confirmed the safety net works" item, not an incident.
**Recommended next step:** User decision — remove the static `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` pair from production's `.env.production` and rely purely on the instance role (matches documented architecture), or intentionally keep it as redundancy. Not changed by this session without explicit approval — editing production credentials is a real action.

### 3. Release 13.8 production deployment — RESOLVED, confirmed deployed
**Status:** Confirmed via live SSH — `/request-access`'s compiled page was present in the container (originally checked against `be05540`; production has since moved on to `864f848` via the hotfix deploy in issue #1, which still contains R13.8). No further action needed on this question.

### 4. `main` vs. deployed branch — RESOLVED
**Status:** `main` and `claude/priceless-keller-10439f` were reconciled via a real merge (`0972810`, not a reset/force-push) and are now identical, both locally and on `origin`. No further action needed here — see issue #1 above for the actual remaining gap (production hasn't caught up to either branch).

### 5. Two unrelated local-only changes were sitting uncommitted (in the `main` worktree, not this one)
**Severity:** Low · **Impact:** `.claude/launch.json` and `src/components/VoiceRecorder.tsx` had uncommitted changes in the primary repo checkout as of the last time it was inspected. Not present in this worktree (each worktree has its own working directory).
**Workaround:** None needed unless you're working directly in that other checkout.
**Recommended next step:** Whoever owns that checkout should confirm intent before committing or discarding.

### 6. `POST /api/events` 500s if Start Date or End Date is left blank — NEW, found during R14.3 deployment verification
**Severity:** Medium · **Impact:** `EventsClient.tsx`'s create-event form always sends `startDate`/`endDate` as empty strings (`""`) when the user leaves them blank, rather than `null`/omitted. Postgres's `date` columns reject `""` outright (`invalid input syntax for type date: ""`, code `22007`), so the whole insert fails with an unhandled 500 rather than a friendly validation message. Reproduced live in production (2026-08-21) while functionally verifying R14.3's ICP event-assignment picker — confirmed **pre-existing and unrelated to R14.2/R14.3**: the same `startDate: "", endDate: ""` form-state pattern exists in the pre-R14.3 version of this component too; R14.3 only added `icpProfileId` handling alongside it. The failed insert is atomic (confirmed via row-count check immediately after — no partial/corrupt event row was created), so no data integrity impact, just a poor error experience for the user.
**Workaround:** Always fill in both Start Date and End Date when creating an event.
**Recommended next step:** Either make `events.start_date`/`end_date` accept `null` from the API (send `undefined`/omit the key when blank, matching how `icpProfileId` already does `form.icpProfileId || null`) or make them required fields in the UI with client-side validation. Small, isolated fix — not scoped to any in-flight release; flag for the next convenient maintenance pass.

## Infrastructure / deployment

### 6. Wildcard subdomain rollout is paused mid-flight (Phases 1–3 of 4)
**Severity:** Medium · **Impact:** Tenant-scoped subdomain login (`{subdomain}.tradeshow-agent.gtmtechsol.ai`) is implemented and verified working (Phase 0, deployed) but not reachable by real users — wildcard SSL, Nginx config, and GoDaddy DNS (Phases 1–3) are prepared but explicitly not executed pending separate approval and GoDaddy credentials this session didn't have.
**Workaround:** All real logins continue via the apex domain, tenant-agnostic-by-email, exactly as before — no regression, just an unfinished feature.
**Recommended next step:** See `docs/wildcard-rollout-runbook.md` for the exact commands staged and ready; needs explicit go-ahead plus GoDaddy DNS access to proceed.

### 7. Deployed Docker image tags carry no version information
**Severity:** Low (process) · **Impact:** Tags like `:s3fix`, `:wf`, `:e51607e`, `:7e2376c` mix ad-hoc labels and git short-SHAs inconsistently — makes "what's actually running" require live container inspection every time rather than reading a doc, and has already caused stale documentation once (see `docs/production-gap-analysis.md`).
**Workaround:** Always verify the live container's tag directly rather than trusting the last-written status doc.
**Recommended next step:** Standardize on tagging every deploy with the git short-SHA (already the de facto pattern for the most recent deploys — just needs to become the *only* pattern, and the tag should be recorded in `CHANGELOG.md`/`STATUS.md` at deploy time).

### 8. HubSpot credentials not configured in production
**Severity:** Medium · **Impact:** `HUBSPOT_ACCESS_TOKEN`/`HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID` were confirmed blank in production as of 2026-06-29 (`docs/pre-demo-hardening-report.md`). CRM Sync approval fails with a clear, user-facing "not connected" message rather than a raw error (fixed in `7e2376c`) — a real UX improvement, but the underlying capability still doesn't work end-to-end until real credentials are supplied.
**Workaround:** CRM Sync UI correctly tells the user it's not connected; nothing crashes.
**Recommended next step:** Supply real HubSpot credentials in `.env.production` (via Secrets Manager) when CRM sync needs to actually work, e.g. before any customer-facing demo of that specific feature.

### 9. AWS Transcribe — account not subscribed
**Severity:** Medium · **Impact:** Every transcription job fails with `SubscriptionRequiredException`. Code/IAM/env vars are all correct — this is an AWS account-level gap, unchanged since Release 5.
**Workaround:** Surfaced honestly in the UI ("Needs Attention").
**Recommended next step:** AWS account action outside the codebase — not something a Claude session can fix by editing code.

### 10. AWS SES — sandbox mode
**Severity:** Medium · **Impact:** Only `info@gtmtechsol.com` can receive real email in production (invitations, password resets, tenant-access-request notifications). Every other recipient silently gets nothing unless they're that one verified address.
**Workaround:** Manual admin action (e.g. sending an invite link directly) when a real user needs onboarding before AWS approves production access.
**Recommended next step:** Escalate the pending `aws sesv2 put-account-details --production-access-enabled` request — this is on AWS's review queue, not something fixable from this session.

### 11. RDS backup retention capped at 1 day (Free Tier)
**Severity:** Medium · **Impact:** A real incident could lose up to a day of data; no path to longer retention without upgrading the AWS account plan.
**Workaround:** None at the infrastructure level.
**Recommended next step:** Decide (with the user) whether this is acceptable for current scale, or whether it's worth the plan upgrade ahead of onboarding real paying tenants.

## Performance

### 12. Dashboard ROI calculation is a sequential N+1 query loop
**Severity:** High · **Impact:** `src/app/(app)/dashboard/page.tsx` calls `recalculateAndStoreROI()` in a sequential loop over every tenant event, each call issuing 8+ queries — a tenant with 10 events means ~80 sequential DB round-trips on every dashboard load. Not yet fixed as of this session.
**Workaround:** Tolerable at current lead/event volume; will degrade as tenants accumulate more events.
**Recommended next step:** `Promise.all()` the per-event calls, or better, a single batched SQL aggregation at the page level. See `docs/code-inspection-report.md` H1.

### 13. Dashboard issues 15+ additional sequential (non-batched) queries
**Severity:** Medium · **Impact:** Adds latency to every dashboard load independent of the N+1 issue above.
**Workaround:** None currently.
**Recommended next step:** Batch with `Promise.all()` where queries are independent. See `docs/code-inspection-report.md` M1.

## Code quality / documentation gaps found this session

### 14. `docs/06-ai-agent-architecture.md` was missing two real agents
**Severity:** Low (documentation only) · **Impact:** `src/lib/agents/opportunity-agent.ts` (Opportunity & Pipeline Intelligence Agent, Release 11) and `src/lib/agents/tenant-provisioning-agent.ts` (Tenant Provisioning Agent, Release 13.8) both exist and are wired into real API routes, but neither was documented in the agent-architecture doc.
**Workaround:** N/A.
**Recommended next step:** Fixed as part of this session — see the updated `docs/06-ai-agent-architecture.md`.

### 15. Lint error count had drifted from what prior docs claimed
**Severity:** Low · **Impact:** `STATUS.md` (as of `main`) claimed ~72 errors/44 warnings; a fresh `npm run lint` run during this session found **36 errors, 22 warnings** — roughly half. Not a regression (nothing here indicates new breakage), most likely the prior figure was imprecise or predates some of the Release 13.7/13.7.1 fixes that touched overlapping files.
**Workaround:** None needed — `npm run build` remains clean either way (lint errors here are all pre-existing React-hooks-rule findings, not build blockers).
**Recommended next step:** Re-run `npm run lint` yourself before trusting either number if picking this up later — don't propagate a stale count forward again.

## Product scope (not bugs — explicitly deferred, restated here for visibility)

- No email-sending capability to leads exists anywhere (follow-up drafts are drafts only, by design).
- No SSO/MFA/SCIM — interfaces are shaped for it, not implemented.
- No billing/subscription backend.
- No policy management UI (`agent_policies` is seed-only, read-only API).
- No automated test suite of any kind (unit, integration, e2e) — see [15-testing-guide.md](15-testing-guide.md).

See [docs/TECHNICAL-DEBT.md](TECHNICAL-DEBT.md) for the code-quality side of this list (duplication, oversized files, naming) and `docs/19-known-limitations.md` for the fuller narrative version of infrastructure/data-model gaps.
