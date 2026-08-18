# Current Known Issues

Point-in-time snapshot compiled 2026-08-18, verified by direct inspection of the codebase, git history, and (where accessible) production — not carried over unchecked from prior docs. See [PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md) for how this fits into the overall picture and [TECHNICAL-DEBT.md](TECHNICAL-DEBT.md) for code-quality debt specifically (this file is about live operational/functional issues; that one is about code that works but should be improved).

## Production deployment

### 1. Production is missing the S3/Transcribe instance-role fix — CONFIRMED, live incident
**Severity:** Critical · **Impact:** Business-card and voice-note uploads are very likely broken in production right now. Confirmed by direct inspection of the running container's compiled code (`docker exec` into the S3Client/TranscribeClient chunks), not inferred from git history — the deployed bundle contains the old unconditional `credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,...}` pattern, which produces an invalid credential object when those env vars are unset (as they intentionally are in production, which relies on the EC2 instance role).
**Root cause:** Production runs commit `be05540` (confirmed via live SSH, `docker ps`) — the tip of `claude/priceless-keller-10439f` *before* it was reconciled with `main` (merge commit `0972810`, which restores this exact fix, originally `06df6d8`). The reconciled code has not been redeployed.
**Workaround:** None in production today.
**Recommended next step:** Deploy `0972810` (or later) to production as the top-priority action — ahead of any Release 14 work. This requires separate explicit approval (a real production deploy, not a docs change) and is not something this session did unilaterally.

### 2. Release 13.8 production deployment — RESOLVED, confirmed deployed
**Status:** Confirmed via live SSH (`docker ps` shows `tradeshow-agent:be05540` running; `/request-access`'s compiled page is present in the container). No further action needed on this specific question — see issue #1 above for what's still actually wrong.

### 3. `main` vs. deployed branch — RESOLVED
**Status:** `main` and `claude/priceless-keller-10439f` were reconciled via a real merge (`0972810`, not a reset/force-push) and are now identical, both locally and on `origin`. No further action needed here — see issue #1 above for the actual remaining gap (production hasn't caught up to either branch).

### 4. Two unrelated local-only changes were sitting uncommitted (in the `main` worktree, not this one)
**Severity:** Low · **Impact:** `.claude/launch.json` and `src/components/VoiceRecorder.tsx` had uncommitted changes in the primary repo checkout as of the last time it was inspected. Not present in this worktree (each worktree has its own working directory).
**Workaround:** None needed unless you're working directly in that other checkout.
**Recommended next step:** Whoever owns that checkout should confirm intent before committing or discarding.

## Infrastructure / deployment

### 5. Wildcard subdomain rollout is paused mid-flight (Phases 1–3 of 4)
**Severity:** Medium · **Impact:** Tenant-scoped subdomain login (`{subdomain}.tradeshow-agent.gtmtechsol.ai`) is implemented and verified working (Phase 0, deployed) but not reachable by real users — wildcard SSL, Nginx config, and GoDaddy DNS (Phases 1–3) are prepared but explicitly not executed pending separate approval and GoDaddy credentials this session didn't have.
**Workaround:** All real logins continue via the apex domain, tenant-agnostic-by-email, exactly as before — no regression, just an unfinished feature.
**Recommended next step:** See `docs/wildcard-rollout-runbook.md` for the exact commands staged and ready; needs explicit go-ahead plus GoDaddy DNS access to proceed.

### 6. Deployed Docker image tags carry no version information
**Severity:** Low (process) · **Impact:** Tags like `:s3fix`, `:wf`, `:e51607e`, `:7e2376c` mix ad-hoc labels and git short-SHAs inconsistently — makes "what's actually running" require live container inspection every time rather than reading a doc, and has already caused stale documentation once (see `docs/production-gap-analysis.md`).
**Workaround:** Always verify the live container's tag directly rather than trusting the last-written status doc.
**Recommended next step:** Standardize on tagging every deploy with the git short-SHA (already the de facto pattern for the most recent deploys — just needs to become the *only* pattern, and the tag should be recorded in `CHANGELOG.md`/`STATUS.md` at deploy time).

### 7. HubSpot credentials not configured in production
**Severity:** Medium · **Impact:** `HUBSPOT_ACCESS_TOKEN`/`HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID` were confirmed blank in production as of 2026-06-29 (`docs/pre-demo-hardening-report.md`). CRM Sync approval fails with a clear, user-facing "not connected" message rather than a raw error (fixed in `7e2376c`) — a real UX improvement, but the underlying capability still doesn't work end-to-end until real credentials are supplied.
**Workaround:** CRM Sync UI correctly tells the user it's not connected; nothing crashes.
**Recommended next step:** Supply real HubSpot credentials in `.env.production` (via Secrets Manager) when CRM sync needs to actually work, e.g. before any customer-facing demo of that specific feature.

### 8. AWS Transcribe — account not subscribed
**Severity:** Medium · **Impact:** Every transcription job fails with `SubscriptionRequiredException`. Code/IAM/env vars are all correct — this is an AWS account-level gap, unchanged since Release 5.
**Workaround:** Surfaced honestly in the UI ("Needs Attention").
**Recommended next step:** AWS account action outside the codebase — not something a Claude session can fix by editing code.

### 9. AWS SES — sandbox mode
**Severity:** Medium · **Impact:** Only `info@gtmtechsol.com` can receive real email in production (invitations, password resets, tenant-access-request notifications). Every other recipient silently gets nothing unless they're that one verified address.
**Workaround:** Manual admin action (e.g. sending an invite link directly) when a real user needs onboarding before AWS approves production access.
**Recommended next step:** Escalate the pending `aws sesv2 put-account-details --production-access-enabled` request — this is on AWS's review queue, not something fixable from this session.

### 10. RDS backup retention capped at 1 day (Free Tier)
**Severity:** Medium · **Impact:** A real incident could lose up to a day of data; no path to longer retention without upgrading the AWS account plan.
**Workaround:** None at the infrastructure level.
**Recommended next step:** Decide (with the user) whether this is acceptable for current scale, or whether it's worth the plan upgrade ahead of onboarding real paying tenants.

## Performance

### 11. Dashboard ROI calculation is a sequential N+1 query loop
**Severity:** High · **Impact:** `src/app/(app)/dashboard/page.tsx` calls `recalculateAndStoreROI()` in a sequential loop over every tenant event, each call issuing 8+ queries — a tenant with 10 events means ~80 sequential DB round-trips on every dashboard load. Not yet fixed as of this session.
**Workaround:** Tolerable at current lead/event volume; will degrade as tenants accumulate more events.
**Recommended next step:** `Promise.all()` the per-event calls, or better, a single batched SQL aggregation at the page level. See `docs/code-inspection-report.md` H1.

### 12. Dashboard issues 15+ additional sequential (non-batched) queries
**Severity:** Medium · **Impact:** Adds latency to every dashboard load independent of the N+1 issue above.
**Workaround:** None currently.
**Recommended next step:** Batch with `Promise.all()` where queries are independent. See `docs/code-inspection-report.md` M1.

## Code quality / documentation gaps found this session

### 13. `docs/06-ai-agent-architecture.md` was missing two real agents
**Severity:** Low (documentation only) · **Impact:** `src/lib/agents/opportunity-agent.ts` (Opportunity & Pipeline Intelligence Agent, Release 11) and `src/lib/agents/tenant-provisioning-agent.ts` (Tenant Provisioning Agent, Release 13.8) both exist and are wired into real API routes, but neither was documented in the agent-architecture doc.
**Workaround:** N/A.
**Recommended next step:** Fixed as part of this session — see the updated `docs/06-ai-agent-architecture.md`.

### 14. Lint error count had drifted from what prior docs claimed
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
