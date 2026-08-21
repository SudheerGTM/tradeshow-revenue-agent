# Trade Show Revenue Agent — Project Status

> **Read [`PROJECT-HANDOFF.md`](PROJECT-HANDOFF.md) first**, not this file — it's now the primary "current state" document. This file is the lighter-weight operational snapshot on top of it; if the two ever disagree, `PROJECT-HANDOFF.md` wins (it's newer).

Last updated: 2026-08-21 (R14.2 + R14.3 — Configurable ICP Foundation + Administration — deployed to production and functionally verified live).

## Current state — read this first

- **S3/Transcribe instance-role hotfix: deployed to production and verified live.** Full incident record: [docs/CURRENT-KNOWN-ISSUES.md](docs/CURRENT-KNOWN-ISSUES.md) #1 (marked Resolved) — **read that entry, not just this summary, for an important correction**: the actual production impact turned out smaller than first assessed, because a static AWS access key was already present in `.env.production` and kept uploads working even under the old buggy code. That static key is now a separate, open follow-up item (see below).
- **R14.2 (Configurable ICP Foundation) and R14.3 (Configurable ICP Administration) are deployed to production and functionally verified live**, per the explicit deployment approval. Production is now running `tradeshow-agent:fec78eb` (previous `864f848` preserved, stopped, as `tradeshow-agent-prev-864f848` for instant rollback). Migrations `0016` and `0017` applied cleanly to production RDS — additive only, zero existing rows affected, verified via before/after row counts. Full ICP Admin UI (`/settings/icp`, `tenant_admin`-only), `/api/icp-profiles/*` CRUD/lifecycle routes, explicit tenant Default ICP (`tenants.default_icp_profile_id`), event-level ICP assignment, and qualitative-only ICP Test Mode were all exercised live against a real production tenant (Demo Logistics): create → populate → save (version bump confirmed) → activate → set default → assign to a new event → run Test Mode (qualitative "Strong" match, zero score, zero audit entry) → deactivate (auto-cleared the tenant default, confirmed in DB) → cross-tenant assignment rejected (403). One **pre-existing, unrelated** bug was found and documented during this verification — see [docs/CURRENT-KNOWN-ISSUES.md](docs/CURRENT-KNOWN-ISSUES.md) #6 (blank event dates cause a 500). Full detail: [docs/RELEASE-14.3-ICP-ADMIN.md](docs/RELEASE-14.3-ICP-ADMIN.md), [docs/ICP-ARCHITECTURE.md](docs/ICP-ARCHITECTURE.md). **Per the deployment approval's explicit stop-gate: do not begin R14.4 (agent integration) without further approval.**
- **New follow-up item found during hotfix verification:** production's `.env.production` has a real, non-empty, static `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` pair (an `AKIA...`-prefixed IAM user key) — this contradicts the documented architecture ("no static AWS access keys live on the box... everything authenticates via the instance role," [10-aws-infrastructure.md](docs/10-aws-infrastructure.md)). The instance role itself is confirmed correctly configured and working (tested directly, live). **Open decision for the user:** rotate out/remove this static key now that the instance-role fallback is confirmed working, or leave it as an intentional redundancy? Not changed by this session without your say-so — removing a working production credential is a real action.
- **`main` and `claude/priceless-keller-10439f` are reconciled and identical** (merge `0972810`, plus the doc-reconciliation commit `864f848` now also deployed). No divergence remains.
- **RDS:** `tradeshow-agent-prod.cnec08ekae5z.eu-central-1.rds.amazonaws.com`, db name `tradeshow`, user `tsadmin`. Credentials in AWS Secrets Manager (`tradeshow-agent/prod`) — `aws secretsmanager get-secret-value --secret-id tradeshow-agent/prod` if needed; don't rely on `/tmp/*.txt` caches persisting across sessions. SSH key: `~/.ssh/tradeshow-agent-key.pem`.
- **`npm run build` is clean** (verified this session — one harmless Turbopack workspace-root warning, no errors).
- **`npm run lint`: 36 errors / 22 warnings** (verified fresh this session — pre-existing React-hooks-rule findings, none block the build).
- **A pre-existing React hydration error (minified error #418)** was observed on the lead detail page (`/leads/:id`) during hotfix verification — reproducible on a clean load, unrelated to the AWS credential fix (that only touched `src/lib/aws/*`), not caused by this deploy. Not investigated further this session; worth a look separately.
- **HubSpot credentials were confirmed blank in production** as of 2026-06-29 — CRM Sync fails gracefully with a "not connected" message (fixed in `7e2376c`) but doesn't work end-to-end until real credentials are supplied.
- **Wildcard subdomain rollout is mid-flight:** tenant-scoped subdomain auth (Phase 0) done and deployed; wildcard SSL/Nginx/DNS (Phases 1–3) prepared but not executed, pending separate approval + GoDaddy access.

## What was just fixed (this session)

**Documentation reconciliation** (commit `864f848`) — fixed stale branch-state claims across `PROJECT-HANDOFF.md`, `RELEASES.md`, `STATUS.md`, `docs/CHANGELOG.md`, `docs/CURRENT-KNOWN-ISSUES.md`, retired the superseded `docs/RELEASE-14-ICP-PLAN.md` to a redirect stub.

**S3/Transcribe production hotfix** — deployed `864f848` (doc commit on top of the `main` reconciliation merge `0972810`, containing `06df6d8`'s instance-role fallback fix and explicitly zero Release 14 ICP code) to production, replacing `be05540`. Verified via:
1. Direct AWS SDK test inside the container: real S3 `PUT`/`GET`/`DELETE` succeeded.
2. Direct instance-role-only test (static key env vars cleared for that one process): confirmed the EC2 instance role itself resolves valid temporary (STS) credentials.
3. **Full authenticated click-path via real API calls** (logged in as `booth@demo.com`, Demo Logistics tenant): business-card upload (`initiate-upload` → S3 `PUT` → `complete-upload`) and voice-note upload, both end-to-end, both confirmed visible in the lead's "Voice & Files" tab afterward, then cleaned up (deleted) since they were test artifacts on a real lead record.
4. General smoke test: login (both `admin@platform.com` and `booth@demo.com`), dashboard, tenants list, lead list, lead detail page — all render correctly, zero new errors in container logs since the new container started.

**Important correction to the original assessment:** production's `.env.production` turned out to already have a valid static AWS access key present, which means the *old* buggy code (unconditional credential-object construction) was very likely **not actually failing** at the time this was flagged as a live incident — a valid non-empty key makes the old code's behavior identical to the new fixed code's. The code bug was real (confirmed via source inspection and via `06df6d8`'s original commit message describing a real 2026-06-26 outage), but its *current* impact was overstated before this was checked. The hotfix was still the right thing to deploy — it restores the documented, more secure, instance-role-first pattern rather than depending on an undocumented static key — but "was this actively broken right now" and "is the correct code now deployed" turned out to be two different questions. See `docs/CURRENT-KNOWN-ISSUES.md` #1 for the full record.

Historical note carried forward from `main`'s side: two real users (`dadalakarthik806@gmail.com`, `sudheer909@gmail.com`) had temporary passwords set directly via SQL back on 2026-06-26, since SES couldn't deliver reset emails to them (sandbox mode). Both should have changed their password via Profile → Change Password since — this is ~7 weeks old and likely resolved, but hasn't been independently reverified.

## What this is

A multi-tenant SaaS for trade-show exhibitors: capture leads on the show floor (manual, QR badge scan, business-card OCR, voice notes), run them through a chain of 8 AI/business-logic agents (conversation intelligence → enrichment → scoring → follow-up drafts → CRM sync → opportunity tracking → ROI attribution → tenant provisioning), and report on event ROI. Full IAM (invitations, password reset, lockout, per-user event access) since Release 13.6; self-service tenant onboarding (request → approve → auto-provision) since Release 13.8. Next.js 16.2.9 (App Router) + TypeScript + PostgreSQL (Drizzle ORM) + NextAuth v5 (JWT).

GitHub: `SudheerGTM/tradeshow-revenue-agent`, branch `claude/priceless-keller-10439f` (pushed to `origin`, now reconciled with `main`).

## Running it locally

```sh
brew services stop postgresql@16   # only if it auto-started on 5432
LC_ALL="en_US.UTF-8" /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 -o "-p 5433" -l /tmp/pg16.log start

npm install
npm run dev      # localhost:3000 (or :3001 if :3000 is taken)
npm run build    # type-check + build — use this to verify changes, confirmed clean this session
npm run lint     # 36 errors / 22 warnings, pre-existing — don't be alarmed
```

Seeded test users (`Password123!` for all): `admin@platform.com` (platform_admin), `admin@demo.com` (tenant_admin), `manager@demo.com` (manager), `booth@demo.com` (booth_user).

`.env.local` is gitignored — see `docs/12-environment-variables.md`. Notable gaps: `HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID`/`HUBSPOT_ACCESS_TOKEN` were confirmed empty in production as of the last check — verify before assuming CRM sync works end-to-end. AWS Transcribe is configured but the AWS account isn't subscribed (account-level gap) — now confirmed to be the *only* remaining blocker for transcription, since the upload-credentials bug is fixed (again, as of this merge). AWS SES is in sandbox mode — only `info@gtmtechsol.com` can receive real email until AWS approves the pending production-access request.

## Release history

See `docs/18-release-history.md` and `docs/CHANGELOG.md`, plus `PROJECT-HANDOFF.md` §3 for the fuller picture including R13.7/13.7.1/13.8. Short version: R1–R12 built the core lead pipeline, R13 added the Agent Orchestrator, R13.5 added Quick Capture, R13.6 added the full IAM overhaul, R13.7 added engineering stabilization + the tenant-subdomain auth foundation, R13.7.1 added workflow idempotency/cost control, R13.8 added tenant self-registration + provisioning. **Production is now at commit `864f848`** (R13.8 + the reconciliation merge + doc fixes) — confirmed via live SSH and functional verification. R14.1 (assessment) and R14.2 (ICP foundation code) are done but not yet committed/deployed.

## Guardrails that matter (don't relax these without being asked)

- **CRM sync never happens automatically** — prepare → human approval → sync, always.
- **Tenant provisioning never happens automatically** — a public access request only ever reaches `requested` status on its own; a `platform_admin` must explicitly approve before `provisionTenantFromAccessRequest()` ever runs.
- **AI never sets a number** — lead score, ROI%, revenue, opportunity amount are deterministic SQL/TS; AI only explains/drafts/summarizes.
- **Follow-up drafts are never sent** — no send capability exists anywhere.
- **No raw password code path** — admin password resets go through an emailed single-use link, same as self-service; `PATCH /api/users/:id` does not accept a password field.
- **Tenant isolation** on every query; `booth_user` restricted to records they created.
- **AWS SDK clients must support the instance-role fallback** — never hardcode an explicit `credentials: {accessKeyId: process.env.X!, ...}` object without a conditional; see `src/lib/email/ses.ts` for the correct pattern. The code-level version of this bug has now happened twice (originally fixed in `06df6d8`, silently regressed when the branches diverged, restored by the reconciliation merge and now deployed as of `864f848`) — don't reintroduce it in a new AWS client. Separately, a static AWS key currently sits in production's `.env.production`, undermining the *purpose* of this guardrail even with correct code — see "Current state" above.
- **Workflow reruns are idempotent** (R13.7.1) — don't reintroduce duplicate-row creation on retry for CRM sync jobs or follow-up drafts.

Full detail in `PROJECT-HANDOFF.md` §9, `docs/07-authentication-security.md`, and `docs/08-multi-tenant-architecture.md`.

## Known issues / things to watch

See **`docs/CURRENT-KNOWN-ISSUES.md`** for the full severity/impact/workaround/next-step list. Highlights:
1. **RESOLVED: S3/Transcribe hotfix deployed and verified live** — production runs `864f848`, real business-card/voice-note upload flows confirmed working end-to-end. See the important nuance in "Current state" above about what was actually broken vs. code-correctness.
2. **NEW: a static AWS access key is present in production's `.env.production`**, contradicting the documented instance-role-only architecture. Instance role confirmed working correctly as a fallback. Open decision: remove the static key now, or leave it? Not changed without your approval.
3. **Release 13.8 IS deployed to production** — confirmed, no longer an open question.
4. **Dashboard N+1 query bug** (`src/app/(app)/dashboard/page.tsx`) — High severity, not yet fixed.
5. **HubSpot credentials blank in production** as of the last check.
6. **Wildcard DNS rollout paused** at Phase 0 of 4 — explicitly gated, not a bug.
7. **EC2 build-time OOM risk** — mitigated by swap; if SSH goes unresponsive mid-deploy, the instance is usually still alive.
8. **Postgres port 5433, not 5432** locally.
9. **Pre-existing React hydration error (#418)** on the lead detail page — observed during hotfix verification, not caused by it, not investigated further.

## What's NOT built (explicitly out of scope so far)

Email sending to leads (by design), real AWS Step Functions/Bedrock AgentCore swap (adapter seam exists), policy management UI, subscription/billing backend, SSO/MFA/SCIM (interfaces shaped for it). Full list in `docs/19-known-limitations.md`.

## Natural next step

The S3/Transcribe hotfix and R14.2 + R14.3 are both done — deployed and verified live. Two things need your decision next: (1) whether to remove the static AWS access key now sitting in production's `.env.production`, now that the instance-role fallback is confirmed working; (2) the pre-existing blank-event-date 500 bug found during R14.3 verification ([docs/CURRENT-KNOWN-ISSUES.md](docs/CURRENT-KNOWN-ISSUES.md) #6) — small, isolated fix, not urgent. R14.4 (wiring a resolved `ICPContext` into Conversation Intelligence) is explicitly gated behind further approval per the R14.3 deployment stop gate.
