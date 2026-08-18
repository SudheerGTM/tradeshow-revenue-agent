# Trade Show Revenue Agent — Developer Documentation

This is the engineering documentation hub for Trade Show Revenue Agent, current as of **Release 13.8** (controlled tenant self-registration/provisioning), on branch `claude/priceless-keller-10439f` — see [PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md) for why that branch, not `main`, is the authoritative one right now. It reflects the actual implementation in the codebase, not the original design briefs — where the two disagree, trust this folder and the code.

**Live deployment:** https://tradeshow-agent.gtmtechsol.ai

## How to use this folder

**If you're a Claude Code session picking up work with no prior context, start at the repo root, not here:** [`CLAUDE-START-HERE.md`](../CLAUDE-START-HERE.md) → [`PROJECT-HANDOFF.md`](../PROJECT-HANDOFF.md) → back to this folder for depth on any one topic.

If you're a new human developer, read in this order:
1. [01-project-overview.md](01-project-overview.md) — what this is and why
2. [02-system-architecture.md](02-system-architecture.md) — how the pieces fit together
3. [13-folder-structure.md](13-folder-structure.md) — where things live
4. [09-deployment-guide.md](09-deployment-guide.md) — get it running locally
5. [03-business-workflows.md](03-business-workflows.md) — what the app actually does, end to end

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
| [19-known-limitations.md](19-known-limitations.md) | Honest gaps and technical debt (narrative) |
| [20-contributing.md](20-contributing.md) | Onboarding + PR process |
| [ONBOARDING.md](ONBOARDING.md) | Windows developer setup guide |
| [code-inspection-report.md](code-inspection-report.md) | Codebase health scan, classified by severity |
| [CURRENT-KNOWN-ISSUES.md](CURRENT-KNOWN-ISSUES.md) | **Live operational issues** — severity/impact/workaround/next-step, refreshed 2026-08-18 |
| [TECHNICAL-DEBT.md](TECHNICAL-DEBT.md) | **Code-quality debt**, Critical/High/Medium/Low, refreshed 2026-08-18 |
| [RELEASE-14-ICP-PLAN.md](RELEASE-14-ICP-PLAN.md) | Retired — see the file itself for where to read instead |
| [CHANGELOG.md](CHANGELOG.md) | Release-by-release changelog |

### Supplementary reports (point-in-time, Release 13.7–13.8 work)

These were produced during specific pieces of work rather than maintained as living reference docs — read them for historical context/evidence, but check the numbered docs above and [CURRENT-KNOWN-ISSUES.md](CURRENT-KNOWN-ISSUES.md) for current state first.

| Doc | Covers |
|---|---|
| [architecture-diagram.md](architecture-diagram.md) | Standalone architecture diagram (Release 13.7) |
| [database-erd.md](database-erd.md) | Standalone ER diagram (Release 13.7) |
| [deployment-diagram.md](deployment-diagram.md) | Standalone deployment diagram (Release 13.7) |
| [deployment-checklist.md](deployment-checklist.md) | Release 13.7 deployment checklist |
| [testing-checklist.md](testing-checklist.md) | Release 13.7 testing checklist |
| [performance-review.md](performance-review.md) | Release 13.7 performance review |
| [security-review.md](security-review.md) | Release 13.7 security review |
| [tenant-auth-review.md](tenant-auth-review.md) | Tenant-scoped authentication design review (Phase 0 of wildcard rollout) |
| [wildcard-domain-review.md](wildcard-domain-review.md) | Wildcard subdomain feasibility review |
| [nginx-wildcard-plan.md](nginx-wildcard-plan.md) | Nginx config changes needed for wildcard subdomains (prepared, not applied) |
| [wildcard-rollout-runbook.md](wildcard-rollout-runbook.md) | **Consolidated, current** wildcard rollout status — supersedes the four docs above for "what's actually left to do" |
| [production-gap-analysis.md](production-gap-analysis.md) | 2026-06-27 production-vs-`main` code verification (superseded by this session's branch-vs-`main` finding — see [PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md)) |
| [production-health-capacity-assessment.md](production-health-capacity-assessment.md) | 2026-06-29 EC2/RDS capacity check ahead of a demo |
| [pre-demo-hardening-report.md](pre-demo-hardening-report.md) | 2026-06-29 pre-demo actions taken (confirms production was running branch code, not `main` — key evidence for [PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md)) |

## Source of truth hierarchy

1. **The code** — always wins in a disagreement.
2. **This `/docs` folder** — kept in sync with the code; update it in the same PR that changes behavior.
3. **[`PROJECT-HANDOFF.md`](../PROJECT-HANDOFF.md) and [`STATUS.md`](../STATUS.md)** (repo root) — point-in-time handoff snapshots; superseded by `/docs` for anything that overlaps, but read first for the current branch/production state, which changes faster than this folder gets updated.
4. **Prior Claude Code conversations** — not a source of truth. If something here contradicts what a previous chat assumed, this folder wins.
5. **A doc's own "supersedes"/"corrected" notes** — several docs in this folder (e.g. [06-ai-agent-architecture.md](06-ai-agent-architecture.md), [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md), [13-folder-structure.md](13-folder-structure.md)) were found to contain stale or incomplete claims during the 2026-08-18 handoff pass and were corrected in place — if a doc and a supplementary report disagree, prefer whichever has the later "corrected"/"updated" date.
