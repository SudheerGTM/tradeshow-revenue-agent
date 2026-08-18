# Start Here

You're picking up **Trade Show Revenue Agent** — a multi-tenant SaaS that turns trade-show booth conversations into sales pipeline (capture → AI enrichment/scoring/follow-up → CRM sync → ROI reporting), with every revenue number computed deterministically, never by AI.

## First, a critical fact about this repo

**`main` and `claude/priceless-keller-10439f` are now identical** (merge commit `0972810`) — the branch-divergence problem that used to be the top item here is resolved. **What's still true and urgent: production is behind both of them.** Confirmed via live SSH: production runs `be05540` (has Release 13.8, does NOT have the S3/Transcribe fix from the reconciliation merge — business-card/voice-note uploads are very likely broken right now). Full evidence: [PROJECT-HANDOFF.md § Git / Worktree State](PROJECT-HANDOFF.md#22-git--worktree-state) and §2 (Current Production State).

## What's live

https://tradeshow-agent.gtmtechsol.ai — a single EC2 instance + RDS Postgres, confirmed via live SSH running Release 13.8 (`be05540`). **That build is missing a real S3/Transcribe bug fix restored in a later merge — deploying the fix is the single highest-priority action item**, ahead of any Release 14 work (see the handoff doc). Full IAM, 8 AI/business-logic agents, HubSpot CRM sync gated behind human approval, and a not-yet-publicly-live wildcard-subdomain multi-tenant auth system.

## Where to read

1. **[PROJECT-HANDOFF.md](PROJECT-HANDOFF.md)** — read this in full before touching code. It covers production state, architecture, IAM, database, every agent, guardrails, AWS infra, deployment, known issues, technical debt, and the git-branch situation above.
2. **[STATUS.md](STATUS.md)** — operational snapshot layered on top.
3. **[docs/README.md](docs/README.md)** — the full engineering documentation suite, topic by topic.

## What not to change without asking first

- The guardrails in [PROJECT-HANDOFF.md §9](PROJECT-HANDOFF.md#9-agent-guardrails) — no automatic CRM sync, no automatic tenant provisioning, no send capability for follow-ups, no AI-set numbers, no bypassing tenant isolation.
- **Don't deploy to production** without explicit approval, even though the S3/Transcribe fix redeploy is urgent — it's a real production action, not something to do unilaterally.
- Wildcard DNS (Phase 3 of the subdomain rollout) — explicitly gated pending separate approval and GoDaddy access; don't proceed on it just because the SSL/Nginx steps are "prepared."
- Release 14 beyond R14.2 — **stop-gated.** R14.1 (assessment) and R14.2 (ICP data model/resolver/duplicate-fit-logic fix) are done and tested locally, but not committed or deployed as of the last update. Do not proceed to the ICP Admin UI, Conversation Intelligence integration, Lead Scoring integration, or Follow-Up integration without further explicit approval — see [docs/ICP-ARCHITECTURE.md](docs/ICP-ARCHITECTURE.md).

## What's next

1. **Deploy the S3/Transcribe fix to production** — the single most urgent item, pending your approval.
2. **Release 14** — R14.1 and R14.2 are complete: [docs/RELEASE-14-CONFIGURABLE-ICP.md](docs/RELEASE-14-CONFIGURABLE-ICP.md) (assessment) and [docs/ICP-ARCHITECTURE.md](docs/ICP-ARCHITECTURE.md) (what R14.2 built). R14.3+ (Admin UI, agent integration) needs explicit approval before starting — do not assume it from this file alone. (The older `docs/RELEASE-14-ICP-PLAN.md` is retired — don't read it as current.)

## Checks to run first

```sh
git status
git branch --show-current
git log --oneline -10
git worktree list
npm install && npm run build
```
