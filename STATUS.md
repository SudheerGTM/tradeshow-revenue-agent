# Trade Show Revenue Agent — Project Status

> **Read [`PROJECT-HANDOFF.md`](PROJECT-HANDOFF.md) first**, not this file — it's now the primary "current state" document. This file is the lighter-weight operational snapshot on top of it; if the two ever disagree, `PROJECT-HANDOFF.md` wins (it's newer).

Last updated: 2026-08-18 (branch reconciliation).

## Current state — read this first

- **`main` and `claude/priceless-keller-10439f` have just been reconciled** via a real merge (not a reset/force-push) — this branch now contains everything from both histories. See "What was just fixed" below for why this mattered more than a routine cleanup.
- **Production is reachable:** https://tradeshow-agent.gtmtechsol.ai returned `307` (redirect to `/dashboard`, normal unauthenticated behavior) when checked this session. A full authenticated smoke test and a live SSH check of the deployed commit were **not** performed this session.
- **Best available evidence on deployed commit:** production was directly confirmed (via container inspection, `docs/pre-demo-hardening-report.md`) running commit `7e2376c` as of 2026-06-29 22:37. Whether Release 13.8 (`be05540`) is live in production is **unconfirmed** — verify before assuming `/request-access` is reachable on the real domain.
- **RDS:** `tradeshow-agent-prod.cnec08ekae5z.eu-central-1.rds.amazonaws.com`, db name `tradeshow`, user `tsadmin`. Credentials in AWS Secrets Manager (`tradeshow-agent/prod`) — `aws secretsmanager get-secret-value --secret-id tradeshow-agent/prod` if needed; don't rely on `/tmp/*.txt` caches persisting across sessions. SSH key: `~/.ssh/tradeshow-agent-key.pem`.
- **`npm run build` is clean** (verified this session — one harmless Turbopack workspace-root warning, no errors).
- **`npm run lint`: 36 errors / 22 warnings** (verified fresh this session — pre-existing React-hooks-rule findings, none block the build).
- **HubSpot credentials were confirmed blank in production** as of 2026-06-29 — CRM Sync fails gracefully with a "not connected" message (fixed in `7e2376c`) but doesn't work end-to-end until real credentials are supplied.
- **Wildcard subdomain rollout is mid-flight:** tenant-scoped subdomain auth (Phase 0) done and deployed; wildcard SSL/Nginx/DNS (Phases 1–3) prepared but not executed, pending separate approval + GoDaddy access.

## What was just fixed (this session — branch reconciliation)

**`main` had one real code fix that `claude/priceless-keller-10439f` was missing: `06df6d8`, the S3/Transcribe instance-role credentials fix.** `claude/priceless-keller-10439f` branched off *before* that fix landed on `main` and never picked it up — meaning `src/lib/aws/s3.ts` and `src/lib/aws/transcribe.ts` still had the old pattern (an explicit credentials object built from `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, invalid when those are unset, as they intentionally are in production). **Since production has been deploying from this branch since 2026-06-27, business-card and voice-note uploads were likely broken again in production this entire time, silently.** The merge just performed restores the fix cleanly (auto-merged with no conflict on those two files). **This needs to be verified live and redeployed to production as a priority — treat this as a live incident, not just a docs cleanup, until confirmed.**

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

See `docs/18-release-history.md` and `docs/CHANGELOG.md`, plus `PROJECT-HANDOFF.md` §3 for the fuller picture including R13.7/13.7.1/13.8. Short version: R1–R12 built the core lead pipeline, R13 added the Agent Orchestrator, R13.5 added Quick Capture, R13.6 added the full IAM overhaul, R13.7 added engineering stabilization + the tenant-subdomain auth foundation, R13.7.1 added workflow idempotency/cost control, R13.8 added tenant self-registration + provisioning. Currently at **13.8** in code; production deployment of 13.8 specifically is unconfirmed.

## Guardrails that matter (don't relax these without being asked)

- **CRM sync never happens automatically** — prepare → human approval → sync, always.
- **Tenant provisioning never happens automatically** — a public access request only ever reaches `requested` status on its own; a `platform_admin` must explicitly approve before `provisionTenantFromAccessRequest()` ever runs.
- **AI never sets a number** — lead score, ROI%, revenue, opportunity amount are deterministic SQL/TS; AI only explains/drafts/summarizes.
- **Follow-up drafts are never sent** — no send capability exists anywhere.
- **No raw password code path** — admin password resets go through an emailed single-use link, same as self-service; `PATCH /api/users/:id` does not accept a password field.
- **Tenant isolation** on every query; `booth_user` restricted to records they created.
- **AWS SDK clients must support the instance-role fallback** — never hardcode an explicit `credentials: {accessKeyId: process.env.X!, ...}` object without a conditional; see `src/lib/email/ses.ts` for the correct pattern. **This has now bitten production twice** — originally fixed in `06df6d8`, silently regressed when the branches diverged, just restored by this merge. Don't reintroduce it in a new AWS client.
- **Workflow reruns are idempotent** (R13.7.1) — don't reintroduce duplicate-row creation on retry for CRM sync jobs or follow-up drafts.

Full detail in `PROJECT-HANDOFF.md` §9, `docs/07-authentication-security.md`, and `docs/08-multi-tenant-architecture.md`.

## Known issues / things to watch

See **`docs/CURRENT-KNOWN-ISSUES.md`** for the full severity/impact/workaround/next-step list. Highlights:
1. **The S3/Transcribe instance-role fix had silently regressed in production since 2026-06-27** — just restored via this merge; needs live verification + redeploy as a priority (see "What was just fixed" above).
2. **Release 13.8's production-deployment status is unconfirmed** — verify via SSH before assuming `/request-access` is live.
3. **Dashboard N+1 query bug** (`src/app/(app)/dashboard/page.tsx`) — High severity, not yet fixed.
4. **HubSpot credentials blank in production** as of the last check.
5. **Wildcard DNS rollout paused** at Phase 0 of 4 — explicitly gated, not a bug.
6. **EC2 build-time OOM risk** — mitigated by swap; if SSH goes unresponsive mid-deploy, the instance is usually still alive.
7. **Postgres port 5433, not 5432** locally.

## What's NOT built (explicitly out of scope so far)

Email sending to leads (by design), real AWS Step Functions/Bedrock AgentCore swap (adapter seam exists), policy management UI, subscription/billing backend, SSO/MFA/SCIM (interfaces shaped for it). Full list in `docs/19-known-limitations.md`.

## Natural next step

**Highest priority: verify the restored S3/Transcribe fix and redeploy to production** — this branch is now the correct code, but production itself hasn't been redeployed since this merge. Second: **Release 14 — Configurable ICP.** A current-state assessment and phased plan already exists at `docs/RELEASE-14-ICP-PLAN.md` — read it, verify it against the code yourself, and get explicit user sign-off on scope before writing any code.
