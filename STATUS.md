# Trade Show Revenue Agent — Project Status

> Handoff doc for picking up this project in a new session. **Read `/docs/README.md` first** — there's a full engineering documentation suite that's the primary source of truth for architecture, schema, API, agents, auth, deployment, known limitations, etc. This file is just the operational "what's live right now and what's unresolved" snapshot on top of that.

Last updated: 2026-06-26.

## Current state — read this first

- **Production is live and healthy:** https://tradeshow-agent.gtmtechsol.ai (200 OK). EC2 `i-0ddfdeaef544e8bdd` (3.73.2.52, eu-central-1), container `tradeshow-agent:s3fix`, built from `main` at commit `06df6d8` — **production now matches `main` exactly**, the earlier IAM-code discrepancy is resolved.
- **RDS endpoint:** `tradeshow-agent-prod.cnec08ekae5z.eu-central-1.rds.amazonaws.com`, db name `tradeshow`, user `tsadmin`. Credentials are in AWS Secrets Manager (`tradeshow-agent/prod`) — `aws secretsmanager get-secret-value --secret-id tradeshow-agent/prod` if you need them; don't rely on `/tmp/*.txt` caches, they get cleared between sessions. SSH key: `~/.ssh/tradeshow-agent-key.pem`.
- **`main` is at commit `06df6d8`**, pushed. `npm run build` is clean (no errors/warnings) as of this check.
- **`npm run lint` has ~72 pre-existing errors / 44 warnings** — all from newer React-hooks ESLint rules (`set-state-in-effect`, `purity`, `immutability`) flagging legacy `useEffect` + synchronous `setState` patterns across ~25 components built in earlier releases (VoiceRecorder, ROIImpactTab, WorkflowTab, most of the `*Client.tsx` list pages, etc.). **None of this blocks the build or is new** — it's app-wide pre-existing technical debt surfaced by a stricter lint ruleset, not a regression. Not yet documented in `docs/code-inspection-report.md` — worth adding there and fixing incrementally rather than all at once.
- **⚠️ A second worktree exists:** `.claude/worktrees/priceless-keller-10439f` (branch `claude/priceless-keller-10439f`), currently one commit ahead of an older point on `main` (`ff0ad64`) with a single additive commit (`docs/ONBOARDING.md`, a Windows dev-setup guide). It does **not** have `main`'s latest S3-credentials fix (`06df6d8`). Working tree is clean. Low risk (one small additive doc file), but **resolve deliberately — either cherry-pick `docs/ONBOARDING.md` into `main` or discard the worktree** — don't let it silently diverge further the way the `sharp-mahavira-d7d16a` worktree did earlier (see `docs/16-troubleshooting.md`, "Migration drift between git branches/worktrees").
- **Two unrelated local-only changes sit uncommitted in the main worktree:** `.claude/launch.json`, `src/components/VoiceRecorder.tsx`. Not part of any recent work — confirm with whoever's working before committing or discarding.

## What was just fixed (this session)

**Business cards and voice-note uploads were broken in production** (Transcribe "not working" was actually upstream of the AWS-subscription gap — voice notes couldn't even upload). Root cause: `src/lib/aws/s3.ts` and `src/lib/aws/transcribe.ts` always built an explicit AWS credentials object from `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, which are intentionally unset in production (it uses the EC2 instance role). An explicit object with `undefined` fields is treated as an invalid resolved credential by the AWS SDK rather than falling through to the instance-role provider chain. Fixed by only passing explicit credentials when `AWS_ACCESS_KEY_ID` is actually set (matches the pattern already used correctly in `src/lib/email/ses.ts`). Separately, production's `.env.production` was also missing `AWS_S3_BUCKET` and the S3 prefix vars entirely — added directly on the instance. Both fixes verified live via real API calls (business-card and voice-note `initiate-upload` both now return `201` with valid presigned URLs). Committed as `06df6d8`.

**Two real users had no recoverable password** (`dadalakarthik806@gmail.com`, `sudheer909@gmail.com` — passwords are bcrypt hashes, never reversible). Set temporary passwords directly via SQL since SES can't deliver a reset email to most real addresses yet (sandbox mode). Both should change their password via Profile → Change Password once they're in.

## What this is

A multi-tenant SaaS for trade-show exhibitors: capture leads on the show floor (manual, QR badge scan, business-card OCR, voice notes), run them through a chain of AI agents (conversation intelligence → enrichment → scoring → follow-up drafts → CRM sync → ROI attribution), and report on event ROI. Full IAM layer (invitations, password reset, lockout, per-user event access) as of Release 13.6. Next.js 16 (App Router) + TypeScript + PostgreSQL (Drizzle ORM) + NextAuth v5 (JWT).

GitHub: `SudheerGTM/tradeshow-revenue-agent`, branch `main`, currently at commit `06df6d8`.

## Running it locally

```sh
# Postgres must be started manually with UTF-8 locale, on port 5433 (not default 5432 —
# a brew-services-managed instance on this machine tends to auto-grab 5432 using the
# SAME data directory; stop it first if pg_ctl complains about an existing lock file)
brew services stop postgresql@16   # only if it auto-started on 5432
LC_ALL="en_US.UTF-8" /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 -o "-p 5433" -l /tmp/pg16.log start

npm install
npm run dev      # localhost:3000 (or :3001 if :3000 is taken)
npm run build    # type-check + build — use this to verify changes, confirmed clean
npm run lint     # passes with pre-existing warnings/errors noted above — don't be alarmed
```

Seeded test users (`Password123!` for all): `admin@platform.com` (platform_admin), `admin@demo.com` (tenant_admin), `manager@demo.com` (manager), `booth@demo.com` (booth_user).

`.env.local` is gitignored — see `docs/12-environment-variables.md` for the full table. Notable gaps: `HUBSPOT_PIPELINE_ID`/`HUBSPOT_STAGE_ID` were empty — verify before assuming CRM sync works end-to-end. AWS Transcribe is configured but the AWS account isn't subscribed to the service (account-level gap, not a code bug — and is now confirmed to be the *only* remaining blocker for transcription, since the upload-credentials bug above is fixed). AWS SES is in sandbox mode — only `info@gtmtechsol.com` can receive real email until AWS approves the pending production-access request (AWS asked for more detail on the use case — that response is on the user, not pending from this session).

## Release history

See `docs/18-release-history.md` and `docs/CHANGELOG.md` for full detail. Short version: R1–R12 built the core lead pipeline (capture → enrichment → scoring → follow-up → CRM sync → ROI), R13 added the Agent Orchestrator, R13.5 added Quick Capture (QR badge scan + business card OCR), R13.6 added the full IAM overhaul (invitations, password reset, lockout, event access scoping). Currently at **13.6**, deployed, with one post-release infra bugfix (`06df6d8`) on top.

## Guardrails that matter (don't relax these without being asked)

- **CRM sync never happens automatically** — prepare → human approval → sync, always.
- **AI never sets a number** — lead score, ROI%, revenue are deterministic SQL/TS; AI only explains/drafts/summarizes.
- **Follow-up drafts are never sent** — no send capability exists anywhere.
- **No raw password code path** — admin password resets go through an emailed single-use link, same as self-service; `PATCH /api/users/:id` does not accept a password field. Confirmed matching in production now.
- **Tenant isolation** on every query; `booth_user` restricted to records they created.
- **AWS SDK clients must support the instance-role fallback** — never hardcode an explicit `credentials: {accessKeyId: process.env.X!, ...}` object without a conditional; see the fix above and `src/lib/email/ses.ts` for the correct pattern. This bit us once already (S3 + Transcribe); don't reintroduce it in a new AWS client.

Full detail in `docs/07-authentication-security.md` and `docs/08-multi-tenant-architecture.md`.

## Known issues / things to watch

See `docs/16-troubleshooting.md` for the full list with fixes. Highlights:
1. **`session.user.id` null bug** — fixed (see history) by adding `token.id`/`session.user.id` wiring in `src/lib/auth.ts`'s callbacks. Check this first if attribution ever looks wrong again.
2. **No migration runner** — `drizzle/*.sql` applied by hand, in order, to every environment separately. Always check `git log` against `main` before assuming a feature doesn't exist (see the second-worktree note above — this exact failure mode just resurfaced).
3. **Dashboard N+1 query bug** (`src/app/(app)/dashboard/page.tsx`) — ROI recalculation loops sequentially per event; High severity, not yet fixed. See `docs/code-inspection-report.md`.
4. **EC2 build-time OOM risk** — t3.small has only 2GB RAM; a 2GB swapfile was added specifically to prevent builds from hanging the instance. If a deploy ever makes SSH unresponsive, the instance is usually still alive — reboot via `aws ec2 reboot-instances`, don't assume it's dead.
5. **Postgres port 5433, not 5432** — see above.
6. **Lint has ~72 pre-existing errors** from newer React-hooks rules — see "Current state" above. Not urgent, but should get its own cleanup pass and an entry in `docs/code-inspection-report.md`.

## What's NOT built (explicitly out of scope so far)

Email sending to leads (by design), real AWS Step Functions/Bedrock AgentCore swap (adapter seam exists, not implemented), policy management UI, subscription/billing backend, SSO/MFA/SCIM (interfaces shaped for it, not implemented). Full list in `docs/19-known-limitations.md`.

## Natural next step

No committed Release 14 scope exists — ask before assuming what's next. Reasonable candidates per `docs/17-future-roadmap.md`: resolve the second worktree (merge or discard), fix the dashboard N+1 query, clean up the newly-surfaced lint errors, add a real migration runner, or start the Step Functions/Bedrock orchestrator swap using the existing `AgentAdapter` seam.
