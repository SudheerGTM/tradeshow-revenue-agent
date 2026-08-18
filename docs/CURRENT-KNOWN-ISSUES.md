# Current Known Issues

Point-in-time snapshot compiled 2026-08-18, verified by direct inspection of the codebase, git history, and (where accessible) production — not carried over unchecked from prior docs. See [PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md) for how this fits into the overall picture and [TECHNICAL-DEBT.md](TECHNICAL-DEBT.md) for code-quality debt specifically (this file is about live operational/functional issues; that one is about code that works but should be improved).

## Branch / git state

### 1. `main` does not reflect the deployed application
**Severity:** Critical (process, not code) · **Impact:** Anyone building on `main` as if it were current would be working from a state ~3 weeks stale relative to what's actually in production, missing Release 13.7 (tenant-scoped auth foundation), 13.7.1 (workflow idempotency), and 13.8 (tenant self-registration + provisioning).
**Root cause:** A separate branch, `claude/priceless-keller-10439f` (pushed to `origin`), continued past `main`'s last commit (`cbfc28f`, 2026-06-27) with 16 additional commits through 2026-06-30, and production was deployed from *that* branch's commits (confirmed via `docs/production-health-capacity-assessment.md` and `docs/pre-demo-hardening-report.md`, both on that branch, which directly observed the running container's image tag). `main` was never updated to match.
**Workaround:** This session's documentation work (including this file) was produced from `claude/priceless-keller-10439f`, which this worktree is now checked out on — not `main`. Treat `claude/priceless-keller-10439f` as the authoritative branch until it's merged.
**Recommended next step:** Merge or fast-forward `main` onto `claude/priceless-keller-10439f` deliberately (with the user's explicit approval — this is a real git operation on the primary branch, not a docs change), then delete/archive the stale branch name to prevent a third session from repeating this exact mistake. See [PROJECT-HANDOFF.md § Git/Worktree Rules](../PROJECT-HANDOFF.md#git--worktree-rules).

### 2. Release 13.8's actual production-deployment status is unconfirmed
**Severity:** Medium · **Impact:** It's confirmed that production was running through at least commit `7e2376c` (2026-06-29 22:37, per `docs/pre-demo-hardening-report.md`, which verified it live). Release 13.8 (`be05540`, tenant self-registration/provisioning, 2026-06-30 09:11) was committed the following morning — no doc found confirms whether it was ever deployed.
**Workaround:** None — this needs live verification.
**Recommended next step:** SSH to the EC2 instance (`~/.ssh/tradeshow-agent-key.pem`, `3.73.2.52`) and run `docker ps` / check the running image tag against `be05540`, or check whether `/request-access` returns a real page vs. 404 on the live domain. This was not verified during this documentation session (SSH access to production was not exercised for a code-behavior check, only used indirectly via the branch's own self-reported docs).

### 3. Two unrelated local-only changes were sitting uncommitted (in the `main` worktree, not this one)
**Severity:** Low · **Impact:** `.claude/launch.json` and `src/components/VoiceRecorder.tsx` had uncommitted changes in the primary repo checkout as of the last time it was inspected. Not present in this worktree (each worktree has its own working directory).
**Workaround:** None needed unless you're working directly in that other checkout.
**Recommended next step:** Whoever owns that checkout should confirm intent before committing or discarding.

## Infrastructure / deployment

### 4. Wildcard subdomain rollout is paused mid-flight (Phases 1–3 of 4)
**Severity:** Medium · **Impact:** Tenant-scoped subdomain login (`{subdomain}.tradeshow-agent.gtmtechsol.ai`) is implemented and verified working (Phase 0, deployed) but not reachable by real users — wildcard SSL, Nginx config, and GoDaddy DNS (Phases 1–3) are prepared but explicitly not executed pending separate approval and GoDaddy credentials this session didn't have.
**Workaround:** All real logins continue via the apex domain, tenant-agnostic-by-email, exactly as before — no regression, just an unfinished feature.
**Recommended next step:** See `docs/wildcard-rollout-runbook.md` for the exact commands staged and ready; needs explicit go-ahead plus GoDaddy DNS access to proceed.

### 5. Deployed Docker image tags carry no version information
**Severity:** Low (process) · **Impact:** Tags like `:s3fix`, `:wf`, `:e51607e`, `:7e2376c` mix ad-hoc labels and git short-SHAs inconsistently — makes "what's actually running" require live container inspection every time rather than reading a doc, and has already caused stale documentation once (see `docs/production-gap-analysis.md`).
**Workaround:** Always verify the live container's tag directly rather than trusting the last-written status doc.
**Recommended next step:** Standardize on tagging every deploy with the git short-SHA (already the de facto pattern for the most recent deploys — just needs to become the *only* pattern, and the tag should be recorded in `CHANGELOG.md`/`STATUS.md` at deploy time).

### 6. HubSpot credentials not configured in production
**Severity:** Medium · **Impact:** `HUBSPOT_ACCESS_TOKEN`/`HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID` were confirmed blank in production as of 2026-06-29 (`docs/pre-demo-hardening-report.md`). CRM Sync approval fails with a clear, user-facing "not connected" message rather than a raw error (fixed in `7e2376c`) — a real UX improvement, but the underlying capability still doesn't work end-to-end until real credentials are supplied.
**Workaround:** CRM Sync UI correctly tells the user it's not connected; nothing crashes.
**Recommended next step:** Supply real HubSpot credentials in `.env.production` (via Secrets Manager) when CRM sync needs to actually work, e.g. before any customer-facing demo of that specific feature.

### 7. AWS Transcribe — account not subscribed
**Severity:** Medium · **Impact:** Every transcription job fails with `SubscriptionRequiredException`. Code/IAM/env vars are all correct — this is an AWS account-level gap, unchanged since Release 5.
**Workaround:** Surfaced honestly in the UI ("Needs Attention").
**Recommended next step:** AWS account action outside the codebase — not something a Claude session can fix by editing code.

### 8. AWS SES — sandbox mode
**Severity:** Medium · **Impact:** Only `info@gtmtechsol.com` can receive real email in production (invitations, password resets, tenant-access-request notifications). Every other recipient silently gets nothing unless they're that one verified address.
**Workaround:** Manual admin action (e.g. sending an invite link directly) when a real user needs onboarding before AWS approves production access.
**Recommended next step:** Escalate the pending `aws sesv2 put-account-details --production-access-enabled` request — this is on AWS's review queue, not something fixable from this session.

### 9. RDS backup retention capped at 1 day (Free Tier)
**Severity:** Medium · **Impact:** A real incident could lose up to a day of data; no path to longer retention without upgrading the AWS account plan.
**Workaround:** None at the infrastructure level.
**Recommended next step:** Decide (with the user) whether this is acceptable for current scale, or whether it's worth the plan upgrade ahead of onboarding real paying tenants.

## Performance

### 10. Dashboard ROI calculation is a sequential N+1 query loop
**Severity:** High · **Impact:** `src/app/(app)/dashboard/page.tsx` calls `recalculateAndStoreROI()` in a sequential loop over every tenant event, each call issuing 8+ queries — a tenant with 10 events means ~80 sequential DB round-trips on every dashboard load. Not yet fixed as of this session.
**Workaround:** Tolerable at current lead/event volume; will degrade as tenants accumulate more events.
**Recommended next step:** `Promise.all()` the per-event calls, or better, a single batched SQL aggregation at the page level. See `docs/code-inspection-report.md` H1.

### 11. Dashboard issues 15+ additional sequential (non-batched) queries
**Severity:** Medium · **Impact:** Adds latency to every dashboard load independent of the N+1 issue above.
**Workaround:** None currently.
**Recommended next step:** Batch with `Promise.all()` where queries are independent. See `docs/code-inspection-report.md` M1.

## Code quality / documentation gaps found this session

### 12. `docs/06-ai-agent-architecture.md` was missing two real agents
**Severity:** Low (documentation only) · **Impact:** `src/lib/agents/opportunity-agent.ts` (Opportunity & Pipeline Intelligence Agent, Release 11) and `src/lib/agents/tenant-provisioning-agent.ts` (Tenant Provisioning Agent, Release 13.8) both exist and are wired into real API routes, but neither was documented in the agent-architecture doc.
**Workaround:** N/A.
**Recommended next step:** Fixed as part of this session — see the updated `docs/06-ai-agent-architecture.md`.

### 13. Lint error count had drifted from what prior docs claimed
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
