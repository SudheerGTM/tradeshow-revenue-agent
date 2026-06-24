# Trade Show Revenue Agent — One-Pager

**What it is:** A multi-tenant SaaS that turns trade-show booth conversations into pipeline. Staff capture leads on the show floor (manually, via QR badge scan, or by photographing a business card), and a chain of AI agents handles enrichment, scoring, follow-up drafting, CRM sync, and ROI reporting — with every revenue-critical number computed deterministically, never by AI.

**Live at:** https://tradeshow-agent.gtmtechsol.ai

---

## Core Lead Pipeline

1. **Capture** — Manual entry, QR badge scan, business-card photo + OCR (Gemini Vision), or a public self-serve QR form. Duplicate detection (email or name+company) warns staff before creating a second record.
2. **Conversation Intelligence** — Gemini-based analysis of booth conversation notes/transcripts: pain points, urgency, next-best-action.
3. **Enrichment** — Apollo.io company + contact data attached automatically.
4. **Lead Scoring** — Deterministic 100-point model (Company Fit / Authority / Need / Urgency / Engagement / Data Quality). AI explains the score; it never sets it.
5. **Follow-Up Intelligence** — AI drafts a follow-up message; a human must approve it. No email is ever sent automatically — there is no send capability by design.
6. **CRM Sync** — Prepares a HubSpot record and stages it `pending_approval`; only a manager/tenant_admin approval actually writes to HubSpot.
7. **Opportunity & Pipeline** — Kanban board, stage-based probability-weighted pipeline.
8. **ROI Analytics** — Event cost tracking, ROI%, AI executive summary (summarizes only — numbers are SQL-computed), PDF/Excel export.
9. **Orchestrator** — Chains all of the above into one "Lead Qualification Workflow" with retry logic and an adapter seam for a future move to AWS Step Functions/Bedrock AgentCore.

## Identity & Access Management

- **Invitations**, not manual account creation — email invite (AWS SES) → recipient sets their own password → auto-login → 5-step onboarding wizard.
- **5-state user lifecycle**: invited → active / inactive / suspended / locked, with admin actions to match.
- **Account lockout** after 5 failed logins; unlockable by an admin or via password reset.
- **Password policy**: 12+ chars, upper/lower/number/special, last-5-password reuse blocked.
- **Self-service** forgot/reset/change password, profile page with avatar upload.
- **Per-user event access** — restrict a booth user to specific events, or leave unrestricted ("All Events"), enforced at the API level on lead reads/writes.
- **Security Dashboard** (`/settings/security`) and **User Adoption** metrics (invited/activated/onboarding completion) for tenant admins.
- Full audit trail (who did what, when, from what IP) for every identity/security action.

## Roles & Tenancy

- `platform_admin` (cross-tenant) → `tenant_admin` → `manager` → `booth_user`, each with progressively narrower access.
- Hard tenant isolation on every query; `booth_user` restricted to leads/workflows they created.

## Guardrails (deliberately not relaxed)

- **AI never sets a number** — score, ROI%, revenue are deterministic SQL/TS; AI only explains, drafts, or summarizes.
- **CRM sync is never automatic** — always prepare → human approval → sync.
- **No outbound email exists** for leads — follow-ups are drafts only.
- **No SSO/MFA yet** — interfaces are shaped for it (Google/Entra/Okta/SCIM), not implemented.

## Stack

Next.js 16 (App Router) · TypeScript · PostgreSQL/Drizzle ORM · NextAuth v5 (JWT) · Gemini (AI) · Apollo.io (enrichment) · HubSpot (CRM) · AWS (S3 for voice/cards/avatars, Transcribe, SES for email) · deployed on EC2 + RDS behind Nginx/Let's Encrypt.

## What's NOT built (explicitly out of scope so far)

Email sending to leads, SSO/MFA/SCIM, real Step Functions/Bedrock orchestration (adapter exists, not wired), subscription/billing backend, policy-management UI.
