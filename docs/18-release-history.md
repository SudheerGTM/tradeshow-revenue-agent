# 18 — Release History

| Release | Features | Database changes | Breaking changes | Migration required |
|---|---|---|---|---|
| R1–R5 | Scaffold, tenant/user management + RBAC, lead capture, voice capture, transcription framework | `0001`, `0002`, `0003` | — | Yes |
| R6 | Conversation Intelligence (Gemini) | `0004` (transcripts), `0005` (conversation_insights) | — | Yes |
| R7 | Apollo company/contact enrichment | `0006` | — | Yes |
| R8 | Lead Scoring — deterministic 100-pt model, AI explains only | `0007` | — | Yes |
| R9 | Follow-Up Intelligence — drafts only, human approval required | `0008` | — | Yes |
| R10 | HubSpot CRM Sync — prepare → approve → sync | `0009` | — | Yes |
| R11 | Opportunity & Pipeline — Kanban, stage probabilities | `0010` | — | Yes |
| R12 | ROI Analytics — event cost tracking, AI executive summary, PDF/Excel export | `0011` | — | Yes |
| R13 | Agent Orchestrator — chains all 6 agents, `AgentAdapter` seam, retry, policies, event bus | `0012` | — | Yes |
| — (UI) | Full GTMTechSol design system redesign (Revenue Blue / AI Turquoise) | None | — | No |
| — (UX) | Mobile/tablet/desktop responsive pass — required moving every page into a `src/app/(app)/*` route group so the shared layout applies everywhere | None | **Yes** — page paths changed structurally | No |
| — (Admin) | Tenant Settings + Users pages (Phase 1+2) | None | — | No |
| R13.5 | Quick Capture — QR badge scan, business card OCR (Gemini Vision), duplicate detection, dashboard adoption metrics | `0013` | — | Yes |
| — (Fix) | iOS Safari black camera preview fix (BusinessCardScanner stream-attachment race) | None | — | No |
| R13.6 | IAM overhaul — email invitations, password reset (no more visible temp passwords), account lockout, 5-state user lifecycle, per-user event access, onboarding wizard, security/adoption dashboards | `0014` | **Yes** — admin "reset password" no longer returns a raw password; invited users have no `users` row until accepted | Yes |
| — (Fix) | Production password drift on `admin@demo.com` — reset directly, cause not fully diagnosed | None | — | No |
| — (Fix) | Restored missing Agent Orchestrator UI (Workflow tab, `/workflows`, `/agents`) to a branch that had diverged from `main` one commit early | None (cherry-pick, no schema change) | — | No |

## Known issues carried across releases

- **`session.user.id` null bug** — present from early releases through R13.6 until fixed; see [16-troubleshooting.md](16-troubleshooting.md). Any data created before the fix may have `NULL` `created_by_user_id`/audit `user_id` values.
- **No migration runner** — present since R1, never addressed.
- **AWS Transcribe subscription gap** — present since R6 (transcription framework), never an application bug, always an AWS account-level gap.

## Dependency additions by release (notable)

- R6: `@google/generative-ai`
- R7: (Apollo — no new package, uses `fetch`)
- R12: `pdfkit`, `exceljs`
- R13.5: `jsqr`
- R13.6: `@aws-sdk/client-ses`
