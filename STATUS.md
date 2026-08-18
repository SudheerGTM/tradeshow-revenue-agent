# Trade Show Revenue Agent — Project Status

> **Read [`PROJECT-HANDOFF.md`](PROJECT-HANDOFF.md) first**, not this file — it's now the primary "current state" document, produced 2026-08-18 after discovering that `main` had fallen 16 commits behind actual production. This file is the lighter-weight operational snapshot on top of it; if the two ever disagree, `PROJECT-HANDOFF.md` wins (it's newer).

Last updated: 2026-08-18.

## Current state — read this first

- **You are (correctly) on `claude/priceless-keller-10439f`, not `main`.** This branch is 16 commits ahead of `main` and is what production actually runs — `main`'s claim of matching production was only true for a few hours in late June. Full evidence: `PROJECT-HANDOFF.md` § Git / Worktree State. **Do not switch to `main` and treat it as current.**
- **Production is reachable:** https://tradeshow-agent.gtmtechsol.ai returned `307` (redirect to `/dashboard`, normal unauthenticated behavior) when checked this session. A full authenticated smoke test and a live SSH check of the deployed commit were **not** performed this session — SSH access to production was available but not exercised for a code-level verification.
- **Best available evidence on deployed commit:** production was directly confirmed (via container inspection, documented in `docs/pre-demo-hardening-report.md`) running commit `7e2376c` as of 2026-06-29 22:37. Release 13.8 (`be05540`, committed the next morning, 2026-06-30) — **whether it's live in production is unconfirmed.** Verify before assuming the self-registration flow (`/request-access`) is reachable on the real domain.
- **This branch's HEAD:** `be05540` (Release 13.8 — tenant self-registration/provisioning). **`main`'s HEAD:** `cbfc28f` — stale, do not build on it without first reconciling (see `PROJECT-HANDOFF.md`).
- **`npm run build` is clean** (verified this session — one harmless Turbopack workspace-root warning, no errors).
- **`npm run lint`: 36 errors / 22 warnings** (verified fresh this session — all pre-existing React-hooks-rule findings, none block the build). A stale prior figure (~72/44) was corrected — always re-run rather than trust a cached count.
- **HubSpot credentials were confirmed blank in production** as of 2026-06-29 (`docs/pre-demo-hardening-report.md`) — CRM Sync fails gracefully with a clear "not connected" message (fixed in `7e2376c`) but the feature doesn't work end-to-end until real credentials are supplied.
- **Wildcard subdomain rollout is mid-flight:** tenant-scoped subdomain auth (Phase 0) is done and deployed; wildcard SSL/Nginx/DNS (Phases 1–3) are prepared but explicitly not executed, pending separate approval + GoDaddy access. See `docs/wildcard-rollout-runbook.md`.

## What this is

A multi-tenant SaaS for trade-show exhibitors: capture leads on the show floor (manual, QR badge scan, business-card OCR, voice notes), run them through a chain of 8 AI/business-logic agents (conversation intelligence → enrichment → scoring → follow-up drafts → CRM sync → opportunity tracking → ROI attribution → tenant provisioning), and report on event ROI. Full IAM (invitations, password reset, lockout, per-user event access) since Release 13.6; self-service tenant onboarding (request → approve → auto-provision) since Release 13.8. Next.js 16.2.9 (App Router) + TypeScript + PostgreSQL (Drizzle ORM) + NextAuth v5 (JWT).

GitHub: `SudheerGTM/tradeshow-revenue-agent`, branch `claude/priceless-keller-10439f` (pushed to `origin`), currently at commit `be05540`.

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

`.env.local` is gitignored — see `docs/12-environment-variables.md`. Notable gaps: `HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID`/`HUBSPOT_ACCESS_TOKEN` were confirmed empty in production as of the last check — verify before assuming CRM sync works end-to-end. AWS Transcribe is configured but the AWS account isn't subscribed (account-level gap). AWS SES is in sandbox mode — only `info@gtmtechsol.com` can receive real email until AWS approves the pending production-access request.

## Release history

See `docs/18-release-history.md` and `docs/CHANGELOG.md`, plus `PROJECT-HANDOFF.md` §3 for the fuller picture including R13.7/13.7.1/13.8, which weren't reflected in the `main`-branch versions of these docs. Short version: R1–R12 built the core lead pipeline, R13 added the Agent Orchestrator, R13.5 added Quick Capture, R13.6 added the full IAM overhaul, R13.7 added engineering stabilization + the tenant-subdomain auth foundation, R13.7.1 added workflow idempotency/cost control, R13.8 added tenant self-registration + provisioning. Currently at **13.8** in code; production deployment of 13.8 specifically is unconfirmed (see above).

## Guardrails that matter (don't relax these without being asked)

- **CRM sync never happens automatically** — prepare → human approval → sync, always.
- **Tenant provisioning never happens automatically** — a public access request only ever reaches `requested` status on its own; a `platform_admin` must explicitly approve before `provisionTenantFromAccessRequest()` ever runs.
- **AI never sets a number** — lead score, ROI%, revenue, opportunity amount are deterministic SQL/TS; AI only explains/drafts/summarizes.
- **Follow-up drafts are never sent** — no send capability exists anywhere.
- **No raw password code path** — admin password resets go through an emailed single-use link, same as self-service.
- **Tenant isolation** on every query; `booth_user` restricted to records they created.
- **AWS SDK clients must support the instance-role fallback** — never hardcode an explicit `credentials: {...}` object without a conditional; see `src/lib/email/ses.ts` for the correct pattern. This bit production once already (S3 + Transcribe, fixed in `06df6d8`).
- **Workflow reruns are idempotent** (R13.7.1) — don't reintroduce duplicate-row creation on retry for CRM sync jobs or follow-up drafts.

Full detail in `PROJECT-HANDOFF.md` §9, `docs/07-authentication-security.md`, and `docs/08-multi-tenant-architecture.md`.

## Known issues / things to watch

See **`docs/CURRENT-KNOWN-ISSUES.md`** for the full severity/impact/workaround/next-step list (refreshed this session — supersedes the bullet list this section used to be). Highlights:
1. **`main` is 16 commits behind this branch and behind production** — the top-priority item; see `PROJECT-HANDOFF.md`.
2. **Release 13.8's production-deployment status is unconfirmed** — verify via SSH before assuming `/request-access` is live.
3. **Dashboard N+1 query bug** (`src/app/(app)/dashboard/page.tsx`) — High severity, not yet fixed.
4. **HubSpot credentials blank in production** as of the last check.
5. **Wildcard DNS rollout paused** at Phase 0 of 4 — explicitly gated, not a bug.
6. **EC2 build-time OOM risk** — mitigated by swap; if SSH goes unresponsive mid-deploy, the instance is usually still alive.
7. **Postgres port 5433, not 5432** locally.

## What's NOT built (explicitly out of scope so far)

Email sending to leads (by design), real AWS Step Functions/Bedrock AgentCore swap (adapter seam exists), policy management UI, subscription/billing backend, SSO/MFA/SCIM (interfaces shaped for it). Full list in `docs/19-known-limitations.md`.

## Natural next step

**Release 14 — Configurable ICP.** A current-state assessment and phased plan already exists at `docs/RELEASE-14-ICP-PLAN.md` — read it, verify it against the code yourself, and get explicit user sign-off on scope (especially the open questions at the end of that doc) before writing any code. Separately, and arguably higher-priority operationally: reconcile `main` with this branch (needs explicit approval — it's a real git operation, not a docs change), and confirm whether Release 13.8 actually made it to production.
