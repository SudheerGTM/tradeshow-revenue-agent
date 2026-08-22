# Releases

Tagged release index, Release 1 through 14.3. For feature-level and database-change detail, see `docs/18-release-history.md`; for chronological commit-level notes, see `docs/CHANGELOG.md`. This file is the short-form index — what shipped, when, and whether it broke compatibility.

**Production status (confirmed via live SSH + functional verification, 2026-08-22):** running `5f230b9` — adds `GET /api/apollo/status` (Apollo connection-status route + UI banner, no schema change), on top of `fec78eb` (R14.2 + R14.3 — Configurable ICP Foundation + Administration, deployed 2026-08-21, functionally verified live against a real production tenant). Migrations `drizzle/0016_icp_profiles.sql` and `drizzle/0017_icp_default_profile.sql` applied cleanly to production RDS (additive only, verified zero existing rows affected). Previous container preserved as `tradeshow-agent-prev-fec78eb` for instant rollback. See `PROJECT-HANDOFF.md` §2 and §22, and `docs/CURRENT-KNOWN-ISSUES.md` #1 for an important correction found during the earlier S3/Transcribe hotfix, and #6 for a pre-existing (unrelated) bug found during the R14.3 deployment's verification.

| Release | Theme | Breaking changes | Migration required |
|---|---|---|---|
| R1–R5 | Scaffold, tenant/user management + RBAC, lead capture, voice capture, transcription framework | — | Yes |
| R6 | Conversation Intelligence (Gemini) | — | Yes |
| R7 | Apollo company/contact enrichment | — | Yes |
| R8 | Lead Scoring — deterministic 100-pt model, AI explains only | — | Yes |
| R9 | Follow-Up Intelligence — drafts only, human approval required | — | Yes |
| R10 | HubSpot CRM Sync — prepare → approve → sync | — | Yes |
| R11 | Opportunity & Pipeline — Kanban, stage probabilities | — | Yes |
| R12 | ROI Analytics — event cost tracking, AI executive summary, PDF/Excel export | — | Yes |
| R13 | Agent Orchestrator — chains all 6 agents, `AgentAdapter` seam, retry, policies, event bus | — | Yes |
| R13.5 | Quick Capture — QR badge scan, business card OCR, duplicate detection | — | Yes |
| R13.6 | IAM overhaul — email invitations, password reset, account lockout, per-user event access | **Yes** — admin "reset password" no longer returns a raw password; invited users have no `users` row until accepted | Yes |
| R13.7 | Engineering Stabilization & Production Readiness — production/main gap analysis, repo inspection, full docs suite, performance/security review, architecture diagrams, release management; **tenant-scoped subdomain authentication** (Phase 0 of wildcard rollout) | No | No |
| R13.7.1 | Workflow idempotency & cost control — CRM sync jobs and follow-up drafts upserted (not duplicated) on workflow re-run; Apollo enrichment skips redundant cached calls; CRM Sync fails gracefully when HubSpot isn't connected | No | No |
| R13.8 | Tenant Provisioning Agent + controlled tenant self-registration (`/request-access` → admin approval → automatic provisioning) | No | Yes (`tenant_access_requests`) |
| R14.1 | Configurable ICP — current-state assessment. See [docs/RELEASE-14-CONFIGURABLE-ICP.md](docs/RELEASE-14-CONFIGURABLE-ICP.md). Approved with conditions. | No | No |
| R14.2 | Configurable ICP Foundation — `icp_profiles` table, ICP Resolver, shared fit-logic bug fix. See [docs/ICP-ARCHITECTURE.md](docs/ICP-ARCHITECTURE.md). **Deployed to production (`fec78eb`).** | No | Yes (`icp_profiles`, additive) |
| **R14.3** (current) | Configurable ICP Administration — ICP Admin UI (`/settings/icp`, `tenant_admin`-only), `/api/icp-profiles/*` CRUD/lifecycle, explicit tenant Default ICP (`tenants.default_icp_profile_id`), event-level ICP assignment, qualitative-only ICP Test Mode (no score, no audit). See [docs/RELEASE-14.3-ICP-ADMIN.md](docs/RELEASE-14.3-ICP-ADMIN.md), [docs/ICP-ARCHITECTURE.md](docs/ICP-ARCHITECTURE.md). **Deployed to production (`fec78eb`) and functionally verified live.** Stop-gated before R14.4 (agent integration). | No | Yes (`tenants.default_icp_profile_id`, additive) |

**Branch note (2026-08-18):** R13.7, R13.7.1, and R13.8 shipped on `claude/priceless-keller-10439f`, which had diverged from `main` — both branches were reconciled via merge (`0972810`) and are now identical, on GitHub and locally.

## Release 13.7 — Engineering Stabilization & Production Readiness

Not a feature release — an engineering quality pass before Release 14. Deliverables:

- [docs/production-gap-analysis.md](docs/production-gap-analysis.md) — verified production (`tradeshow-agent:s3fix`) is functionally current with `main`; corrected a stale assumption in `STATUS.md` that production was behind.
- [docs/code-inspection-report.md](docs/code-inspection-report.md) — repository inspection (dead code, unused routes, oversized files, etc.)
- [docs/performance-review.md](docs/performance-review.md) — dashboard N+1 query and related findings, documented not yet fixed
- [docs/security-review.md](docs/security-review.md) — auth, validation, rate limiting, headers findings
- [docs/architecture-diagram.md](docs/architecture-diagram.md), [docs/database-erd.md](docs/database-erd.md), [docs/deployment-diagram.md](docs/deployment-diagram.md)
- Full documentation suite in `docs/01-*.md` through `docs/20-*.md`
- This file and `docs/CHANGELOG.md`

**Known issues carried into Release 14** (not fixed in 13.7 by design — documentation/identification only):
- Dashboard ROI recalculation N+1 query (`src/app/(app)/dashboard/page.tsx`) — see performance review
- No runtime request-body validation library (zod or equivalent) — see security review
- No rate limiting beyond login lockout — see security review
- No security headers (CSP, X-Frame-Options) configured — see security review
- No automated migration runner — present since R1, still manual
- Image tags carry no git-commit linkage — process gap identified in gap analysis

## Earlier releases

For full feature/database-change/breaking-change detail on R1–R13.6, see `docs/18-release-history.md`.
