# Trade Show Revenue Agent — Project Status

> Handoff doc for picking up this project in a new session. **Read `/docs/README.md` first** — there's now a full engineering documentation suite that's the primary source of truth for architecture, schema, API, agents, auth, deployment, known limitations, etc. This file is just the operational "what's live right now and what's unresolved" snapshot on top of that.

Last updated: 2026-06-25.

## Current state — read this first

- **Production is live and healthy:** https://tradeshow-agent.gtmtechsol.ai (returns 200). EC2 instance `i-0ddfdeaef544e8bdd` (3.73.2.52, eu-central-1), container `tradeshow-agent:wf`, up 18h+, memory/swap healthy (2GB swap was added after an earlier OOM incident — see `docs/16-troubleshooting.md`).
- **RDS endpoint:** `tradeshow-agent-prod.cnec08ekae5z.eu-central-1.rds.amazonaws.com`. SSH key: `~/.ssh/tradeshow-agent-key.pem`. These were previously cached in `/tmp/*.txt` files that have since been cleared by a reboot/cleanup — don't rely on `/tmp` persisting across sessions; re-derive via `aws ec2 describe-instances`/`aws rds describe-db-instances` if needed (filters/identifiers above).
- **`/docs` exists and is committed** (commit `4aee90d`, pushed to `main`). It documents the codebase as of Release 13.6. Treat it as authoritative over this file and over any prior chat history.
- **✅ Resolved (2026-06-27): production-vs-main IAM discrepancy.** Direct inspection of the running container found production is actually running `tradeshow-agent:s3fix` (not `:wf` as previously documented here) — a newer image that includes both the IAM overhaul (`d0fcd51`) and the subsequent S3/Transcribe instance-role fix (`06df6d8`). No raw-password code path exists in the deployed `PATCH /api/users/:id` route; full invitation route surface is present. Production and `main` (`cbfc28f`) are functionally aligned. Full evidence and method in `docs/production-gap-analysis.md`. Process gap identified: image tags (`wf`, `s3fix`, `iam`, etc.) carry no version info — consider tagging future builds with the git short-SHA.
- **Two unrelated local-only changes sit uncommitted:** `.claude/launch.json`, `src/components/VoiceRecorder.tsx`. Not part of any doc/IAM work — ask the user before committing or discarding them, they may be intentional in-progress edits.

## What this is

A multi-tenant SaaS for trade-show exhibitors: capture leads on the show floor (manual, QR badge scan, business-card OCR, voice notes), run them through a chain of AI agents (conversation intelligence → enrichment → scoring → follow-up drafts → CRM sync → ROI attribution), and report on event ROI. Full IAM layer (invitations, password reset, lockout, per-user event access) as of Release 13.6. Next.js 16 (App Router) + TypeScript + PostgreSQL (Drizzle ORM) + NextAuth v5 (JWT).

GitHub: `SudheerGTM/tradeshow-revenue-agent`, branch `main`, currently at commit `4aee90d`.

## Running it locally

```sh
# Postgres must be started manually with UTF-8 locale, on port 5433 (not default 5432 —
# a brew-services-managed instance on this machine tends to auto-grab 5432 using the
# SAME data directory; stop it first if pg_ctl complains about an existing lock file)
brew services stop postgresql@16   # only if it auto-started on 5432
LC_ALL="en_US.UTF-8" /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 -o "-p 5433" -l /tmp/pg16.log start

npm install
npm run dev      # localhost:3000 (or :3001 if :3000 is taken)
npm run build    # type-check + build — use this to verify changes, no separate typecheck script
npm run lint
```

Seeded test users (`Password123!` for all): `admin@platform.com` (platform_admin), `admin@demo.com` (tenant_admin), `manager@demo.com` (manager), `booth@demo.com` (booth_user).

`.env.local` is gitignored — see `docs/12-environment-variables.md` for the full table. Notable gaps confirmed during the last session: `HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID` were empty — verify before assuming CRM sync works end-to-end. AWS Transcribe is configured but the AWS account isn't subscribed to the service (account-level gap, not a code bug). AWS SES is in sandbox mode — only `info@gtmtechsol.com` can receive real email until AWS approves the pending production-access request.

## Release history

See `docs/18-release-history.md` and `docs/CHANGELOG.md` for full detail. Short version: R1–R12 built the core lead pipeline (capture → enrichment → scoring → follow-up → CRM sync → ROI), R13 added the Agent Orchestrator, R13.5 added Quick Capture (QR badge scan + business card OCR), R13.6 added the full IAM overhaul (invitations, password reset, lockout, event access scoping). Currently at **13.6**, deployed.

## Guardrails that matter (don't relax these without being asked)

- **CRM sync never happens automatically** — prepare → human approval → sync, always.
- **AI never sets a number** — lead score, ROI%, revenue are deterministic SQL/TS; AI only explains/drafts/summarizes.
- **Follow-up drafts are never sent** — no send capability exists anywhere.
- **No raw password code path** — admin password resets go through an emailed single-use link, same as self-service; `PATCH /api/users/:id` does not accept a password field on `main` (verify production matches — see the unresolved item above).
- **Tenant isolation** on every query; `booth_user` restricted to records they created.

Full detail in `docs/07-authentication-security.md` and `docs/08-multi-tenant-architecture.md`.

## Known issues / things to watch

See `docs/16-troubleshooting.md` for the full list with fixes. Highlights:
1. **`session.user.id` null bug** — was silently writing `NULL` to `created_by_user_id`/audit `userId` everywhere; fixed by adding `token.id`/`session.user.id` wiring in `src/lib/auth.ts`'s callbacks. Check this first if attribution ever looks wrong again.
2. **No migration runner** — `drizzle/*.sql` applied by hand, in order, to every environment separately. A branch once drifted a full release behind `main` because of this — always check `git log` against `main` before assuming a feature doesn't exist.
3. **Dashboard N+1 query bug** (`src/app/(app)/dashboard/page.tsx`) — ROI recalculation loops sequentially per event; High severity, not yet fixed. See `docs/code-inspection-report.md`.
4. **EC2 build-time OOM risk** — t3.small has only 2GB RAM; a 2GB swapfile was added specifically to prevent builds from hanging the instance. If a deploy ever makes SSH unresponsive, the instance is usually still alive — reboot via `aws ec2 reboot-instances`, don't assume it's dead.
5. **Postgres port 5433, not 5432** — see above.

## What's NOT built (explicitly out of scope so far)

Email sending to leads (by design), real AWS Step Functions/Bedrock AgentCore swap (adapter seam exists, not implemented), policy management UI, subscription/billing backend, SSO/MFA/SCIM (interfaces shaped for it, not implemented). Full list in `docs/19-known-limitations.md`.

## Natural next step

No committed Release 14 scope exists — ask before assuming what's next. Reasonable candidates per `docs/17-future-roadmap.md`: fix the dashboard N+1 query (quick, high-value), add a real migration runner, or start the Step Functions/Bedrock orchestrator swap using the existing `AgentAdapter` seam. Resolve the production-vs-main IAM code discrepancy noted above before building further on top of user management.
