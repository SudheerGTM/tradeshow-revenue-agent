# Trade Show Revenue Agent — Developer Documentation

This is the engineering documentation hub for Trade Show Revenue Agent, current as of **Release 13.6** (Identity & Access Management overhaul). It reflects the actual implementation in the codebase, not the original design briefs — where the two disagree, trust this folder and the code.

**Live deployment:** https://tradeshow-agent.gtmtechsol.ai

## How to use this folder

If you're a new developer, read in this order:
1. [01-project-overview.md](01-project-overview.md) — what this is and why
2. [02-system-architecture.md](02-system-architecture.md) — how the pieces fit together
3. [13-folder-structure.md](13-folder-structure.md) — where things live
4. [09-deployment-guide.md](09-deployment-guide.md) — get it running locally
5. [03-business-workflows.md](03-business-workflows.md) — what the app actually does, end to end

If you're a Claude Code session picking up work with no prior context, start with this README, then [19-known-limitations.md](19-known-limitations.md) and [17-future-roadmap.md](17-future-roadmap.md) to understand what's intentionally unfinished vs. broken.

## Index

| Doc | Covers |
|---|---|
| [01-project-overview.md](01-project-overview.md) | Purpose, customers, business value, stack, release status |
| [02-system-architecture.md](02-system-architecture.md) | Application architecture, diagrams |
| [03-business-workflows.md](03-business-workflows.md) | Lead capture → ROI, user management workflows |
| [04-database-schema.md](04-database-schema.md) | Every table, relationship, enum, ER diagram |
| [05-api-reference.md](05-api-reference.md) | Every API route |
| [06-ai-agent-architecture.md](06-ai-agent-architecture.md) | Every AI/business-logic agent + orchestrator |
| [07-authentication-security.md](07-authentication-security.md) | NextAuth, roles, lockout, audit, SSO readiness |
| [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md) | Tenant isolation model |
| [09-deployment-guide.md](09-deployment-guide.md) | Local dev → production deploy |
| [10-aws-infrastructure.md](10-aws-infrastructure.md) | EC2, RDS, S3, SES, Transcribe, IAM |
| [11-integrations.md](11-integrations.md) | Apollo, Gemini, HubSpot, AWS |
| [12-environment-variables.md](12-environment-variables.md) | Every env var |
| [13-folder-structure.md](13-folder-structure.md) | Repo layout |
| [14-coding-standards.md](14-coding-standards.md) | Conventions |
| [15-testing-guide.md](15-testing-guide.md) | How this app is actually tested today |
| [e2e-testing-guide.md](e2e-testing-guide.md) | Full click-by-click end-to-end test script, every feature |
| [16-troubleshooting.md](16-troubleshooting.md) | Known failure modes + fixes |
| [17-future-roadmap.md](17-future-roadmap.md) | What's next |
| [18-release-history.md](18-release-history.md) | Every release to date |
| [19-known-limitations.md](19-known-limitations.md) | Honest gaps and technical debt |
| [20-contributing.md](20-contributing.md) | Onboarding + PR process |
| [code-inspection-report.md](code-inspection-report.md) | Codebase health scan, classified by severity |
| [CHANGELOG.md](CHANGELOG.md) | Release-by-release changelog |

## Source of truth hierarchy

1. **The code** — always wins in a disagreement.
2. **This `/docs` folder** — kept in sync with the code; update it in the same PR that changes behavior.
3. **`STATUS.md`** (repo root) — a point-in-time handoff snapshot from before this doc set existed; superseded by `/docs` for anything that overlaps.
4. **Prior Claude Code conversations** — not a source of truth. If something here contradicts what a previous chat assumed, this folder wins.
