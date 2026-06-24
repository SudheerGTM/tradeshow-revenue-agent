# Trade Show Revenue Agent — Project Status

> Handoff doc for picking up this project in a new session. Point Claude at this file first. This is a status snapshot, not auto-loaded project instructions — `CLAUDE.md` (which just includes `AGENTS.md`, a Next.js version warning) is unaffected.

Last updated: 2026-06-24, after Release 13 + the IAM/password-reset merge described below.

## ⚠️ Recent: merged in a parallel worktree's IAM work

A sibling worktree (`.claude/worktrees/sharp-mahavira-d7d16a`, branch `claude/sharp-mahavira-d7d16a`) had — uncommitted — already built a full identity/access-management overhaul (token-based invitations, email-based password reset, account lockout, password history, per-user event access, business card scanning, QR badge scanning, duplicate-lead detection) that this worktree didn't know about. Both worktrees shared the same local Postgres database, so this could have silently corrupted shared state. Per user direction, that worktree's commit (`6ab19aa`, Docker/production support) was cherry-picked and its uncommitted working-tree changes were copied file-for-file into this worktree, which is now the single source of truth. **The `sharp-mahavira-d7d16a` worktree is now stale — its work has been absorbed here. Don't develop in it further; it should be removed once you've confirmed nothing else in it is needed.**

On top of that merge, the specific P1 fix (admin "Reset Password" was generating and flashing a temporary password instead of emailing a reset link) was finished here:
- Added `POST /api/users/:id/reset-password` (admin-initiated, emails a secure link, audit action `password_reset_requested`)
- Removed the `password` field entirely from `PATCH /api/users/:id` — there is no longer any code path where an admin can directly set/see a user's password
- Fixed `invitation_resent` / `invitation_cancelled` audit action names (the merged code logged `user_invited` with a `resend: true` flag, and didn't log cancellation at all)
- Fixed invitation status badges to read "Pending / Accepted / Expired / Cancelled" (was showing "Invited" / raw enum values)
- Fixed a stale `NEXTAUTH_URL` (`:3001`) that made every emailed link point at the wrong port
- Added `EMAIL_PROVIDER=console` to `.env.local` (defaults to logging emails to the server console — nothing is actually sent until you set `EMAIL_PROVIDER=ses` and verify a sender identity in the AWS SES console for the `AWS_REGION` already in use)

None of this is committed yet — review before committing, since it touches auth, schema, and the admin Users page.

## What this is

A multi-tenant SaaS for logistics/trade-show exhibitors: capture leads on the show floor, run them through a chain of AI agents (conversation intelligence → enrichment → scoring → follow-up drafts → CRM sync → ROI attribution), and report on event ROI. Next.js 16 (App Router) + TypeScript + PostgreSQL (Drizzle ORM) + Firebase-free, NextAuth v5 (JWT) for auth.

GitHub: `SudheerGTM/tradeshow-revenue-agent`, branch `main`. All 13 releases below are committed and pushed.

## Running it

```sh
# Postgres must be started manually with UTF-8 locale, on port 5433 (not default 5432 —
# something else on this machine already owns 5432)
LC_ALL="en_US.UTF-8" /opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 -o "-p 5433" -l /tmp/pg16.log start

npm run dev      # localhost:3000
npm run build    # type-check + build (use this to verify changes — no separate type-check script)
npm run lint
```

Seeded test users (`Password123!` for all):

| Email | Role |
|---|---|
| `admin@platform.com` | platform_admin |
| `admin@demo.com` | tenant_admin |
| `manager@demo.com` | manager |
| `booth@demo.com` | booth_user |

`.env.local` is gitignored, already has real keys for: Apollo, Gemini (`gemini-2.5-flash` — older model names 404), AWS S3 (voice notes, `eu-central-1`), HubSpot (token now present — was missing earlier in the project, since added). AWS Transcribe is *configured* but the AWS account itself isn't subscribed to the service (`SubscriptionRequiredException`) — that's an AWS account issue, not a code bug, and is surfaced honestly as "Needs Attention" in the Integrations card rather than papered over.

## Release history (all shipped, in order)

| # | What it added |
|---|---|
| R1–R5 | Scaffold, tenant/user management + RBAC, lead capture, voice capture, transcription framework |
| R6 | Conversation Intelligence (Gemini) |
| R7 | Apollo company/contact enrichment |
| R8 | Lead Scoring — deterministic 100-pt model (Company Fit/Authority/Need/Urgency/Engagement/Data Quality), AI explains only, never sets the score |
| R9 | Follow-Up Intelligence — drafts only, human approval required, never sends |
| R10 | HubSpot CRM Sync — prepare → approve → sync, never automatic |
| R11 | Opportunity & Pipeline — Kanban board, stage-based probabilities |
| R12 | ROI Analytics — event cost tracking, ROI%, AI executive summary (summarizes only, never computes numbers), PDF/Excel export |
| R13 | **Agent Orchestrator** — chains all 6 agents into one "Lead Qualification Workflow," adapter pattern for future AWS Step Functions/Bedrock AgentCore swap, retry logic, policy engine, event bus |
| — | Full GTMTechSol UI redesign (Revenue Blue `#0F4C81` / AI Turquoise `#00B8D9`) |
| — | Mobile/tablet/desktop responsive pass — **important structural fix**: had to move every page from `src/app/*` into a `src/app/(app)/*` route group because the shared sidebar/topbar layout only ever applied to `/dashboard` before that (Next.js layouts only wrap routes nested under them) |
| — | Admin UX Phase 1 + 2 — Tenant Settings (Team Performance, Current Event, Tenant Health score, Integrations, Recent Activity, Subscription placeholder) and Users page (KPIs, role badges, Invite User flow, performance drawer) |

## Architecture map

```
src/app/(app)/...          all authenticated pages (route group — see note above)
src/app/api/...            API routes
src/app/login, src/app/capture/[tenant]/[event]   public, NOT in the (app) group

src/lib/agents/            one file per agent's core logic (scoreLead, generateFollowup,
                            prepareCRMRecord, recalculateAndStoreROI, enrichLead wrappers,
                            conversation-agent wrapper) — each exports a callable function
                            used both by its own API route AND by the orchestrator
src/lib/orchestrator/      types.ts (AgentAdapter interface — the AWS migration seam),
                            agents.ts (concrete adapters wrapping the agents/ functions),
                            orchestrator.ts (startWorkflow/retryStep/cancelWorkflow/etc.),
                            event-bus.ts, policies.ts
src/lib/integrations/      hubspot.ts (server-side only, never reaches browser)
src/lib/enrichment/        apollo.ts
src/lib/ai/                provider.ts (Gemini wrapper)

src/components/lead-detail/   the 11-tab Lead Details workspace (Overview, Conversation,
                               Company, Scoring, Follow-Up, Opportunity, Activity, Voice,
                               CRM, ROI, Workflow)
src/components/admin/         Tenant Settings / Users page building blocks
src/components/workflow/      shared step-list UI for /workflows and the lead-detail tab

drizzle/000N_*.sql         migrations 1–12, applied directly via psql (no migration runner
                            wired up — run each .sql file by hand against the local DB)
```

## Guardrails that matter (don't relax these without being asked)

- **CRM sync never happens automatically.** Every code path — manual UI, orchestrator step — only ever calls `prepareCRMRecord()` and inserts a `pending_approval` row. Actual HubSpot writes only happen via the approve endpoint, gated to manager/tenant_admin.
- **AI never sets a number.** Lead score, ROI %, revenue figures are all computed in deterministic SQL/TS. AI only explains, drafts, or summarizes.
- **Follow-up drafts are never sent.** No email-sending system exists by design.
- **Tenant isolation** on every query; `booth_user` is generally restricted to leads/workflows/syncs they created.

## Known issues / things to watch

1. **`session.user.id` can be `null` for some seeded sessions** — hit this as a real bug in R13 (orchestrator coerced it to `""`, which crashed an audit-log insert because `""` isn't a valid UUID). Fixed by widening `scoreLead`/`generateFollowup` signatures to accept `string | null`. If you add new code that takes a `userId`, default to `string | null`, not `string`.
2. **Apollo's `/people/search` endpoint is deprecated** — fixed in `src/lib/enrichment/apollo.ts` to use `/mixed_people/api_search` (returns obfuscated data) + `/people/match` (reveals it). If contact enrichment starts silently failing again, check this first.
3. **No migration runner** — migrations are plain `.sql` files applied by hand. If you add a new table, write `drizzle/0013_*.sql` and run it with `psql` yourself; nothing automates this.
4. **Postgres on port 5433, not 5432** — something else on this machine holds 5432. Always pass `-o "-p 5433"` when starting it manually, and always `LC_ALL="en_US.UTF-8"` or the cluster won't start.

## What's NOT built (explicitly out of scope so far)

- Email sending (anywhere)
- Real AWS Step Functions / Bedrock AgentCore integration (R13 only built the adapter seam for this)
- Policy management UI (policies are seeded directly in `agent_policies`, read-only API exists, no edit UI)
- Subscription/billing backend (Settings page has a clearly-labeled placeholder card only)

## Natural next step

Release 13's stated target: "Release 14 will introduce..." was never specified by the user — ask before assuming what's next. The orchestrator is explicitly designed so the next move (real Step Functions/EventBridge/Bedrock AgentCore swap) only requires writing new `AgentAdapter` implementations, not touching the engine, schema, or UI.
