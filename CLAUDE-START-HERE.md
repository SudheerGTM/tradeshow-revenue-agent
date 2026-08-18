# Start Here

You're picking up **Trade Show Revenue Agent** — a multi-tenant SaaS that turns trade-show booth conversations into sales pipeline (capture → AI enrichment/scoring/follow-up → CRM sync → ROI reporting), with every revenue number computed deterministically, never by AI.

## First, a critical fact about this repo

**`main` is stale.** The branch you're most likely reading this on, `claude/priceless-keller-10439f`, is the one that actually matches what's deployed to production — it's 16 commits ahead of `main` (Releases 13.7, 13.7.1, and 13.8). If you're on `main` instead, or unsure which branch you're on, **stop and run `git branch --show-current` and `git log --oneline -5` before doing anything else.** Full evidence: [PROJECT-HANDOFF.md § Git / Worktree State](PROJECT-HANDOFF.md#22-git--worktree-state).

## What's live

https://tradeshow-agent.gtmtechsol.ai — a single EC2 instance + RDS Postgres, currently Release 13.8 (tenant self-registration) in code, though the exact deployed commit needs re-verification (see the handoff doc). Full IAM, 8 AI/business-logic agents, HubSpot CRM sync gated behind human approval, and a not-yet-publicly-live wildcard-subdomain multi-tenant auth system.

## Where to read

1. **[PROJECT-HANDOFF.md](PROJECT-HANDOFF.md)** — read this in full before touching code. It covers production state, architecture, IAM, database, every agent, guardrails, AWS infra, deployment, known issues, technical debt, and the git-branch situation above.
2. **[STATUS.md](STATUS.md)** — operational snapshot layered on top.
3. **[docs/README.md](docs/README.md)** — the full engineering documentation suite, topic by topic.

## What not to change without asking first

- The guardrails in [PROJECT-HANDOFF.md §9](PROJECT-HANDOFF.md#9-agent-guardrails) — no automatic CRM sync, no automatic tenant provisioning, no send capability for follow-ups, no AI-set numbers, no bypassing tenant isolation.
- The `main` vs. `claude/priceless-keller-10439f` situation — don't merge, don't pick a branch unilaterally on a future session; the user already made this call once this session, but a merge into `main` itself hasn't happened yet and is a decision on its own.
- Wildcard DNS (Phase 3 of the subdomain rollout) — explicitly gated pending separate approval and GoDaddy access; don't proceed on it just because the SSL/Nginx steps are "prepared."

## What's next

**Release 14 — Configurable ICP.** The app currently assumes one fixed vertical (logistics/supply-chain) in its scoring logic. A full current-state assessment and phased plan already exists: [docs/RELEASE-14-ICP-PLAN.md](docs/RELEASE-14-ICP-PLAN.md).

## Checks to run first

```sh
git status
git branch --show-current
git log --oneline -10
git worktree list
npm install && npm run build
```

> Do not begin Release 14 implementation until you have inspected the current repository and provided an R14.1 ICP current-state assessment for user approval — one already exists at `docs/RELEASE-14-ICP-PLAN.md`, but confirm it against the code yourself before acting on it, and get the user's explicit sign-off on scope before writing any code.
