# 01 — Project Overview

## Why this exists

Trade show booths generate a burst of leads in a short window, almost always captured on paper, a generic spreadsheet, or a clunky badge-scanner app whose data nobody looks at again. By the time anyone follows up, the urgency and context from the conversation is gone. Trade Show Revenue Agent exists to close that gap: capture a lead in under 15 seconds at the booth, and have AI agents immediately enrich, score, and draft a follow-up — so sales reps act on hot leads while the conversation is still fresh, instead of weeks later from a CSV export.

## Target customers

B2B exhibitors who run a meaningful trade-show program — logistics/supply-chain companies are the explicit design target (seed data, scoring weights, and example copy all assume this vertical), but nothing in the architecture is logistics-specific. Multi-tenant from day one: an agency or platform operator could run many exhibiting companies (tenants) on one deployment, each with isolated data and their own team of booth staff, managers, and admins.

## Business value

- **Speed to capture:** QR badge scan or business-card photo replaces manual typing at the booth.
- **No lead goes cold silently:** every lead is automatically scored, and follow-up drafts are generated immediately — a human still has to approve and send, but the busywork of drafting is gone.
- **Executive visibility without manual reporting:** event ROI, pipeline value, and cost-per-lead are computed automatically per event, with an AI-written executive summary layered on top of numbers that are always computed deterministically (never hallucinated).
- **CRM hygiene by design:** nothing reaches HubSpot without explicit human approval, so the CRM doesn't fill up with bad trade-show data the sales team doesn't trust.

## Major features (as of Release 13.6)

- Lead capture: manual entry, public QR self-serve form, staff-operated QR badge scan, business-card photo + OCR, voice notes + transcription
- Conversation Intelligence (Gemini) — pain points, urgency, next-best-action extraction
- Apollo.io company/contact enrichment
- Deterministic lead scoring (0–100) with AI-generated explanation
- Follow-up draft generation (email/LinkedIn/meeting/call script) — drafts only, never sent
- HubSpot CRM sync — prepare → human approval → sync, never automatic
- Opportunity/pipeline management (Kanban-style stages)
- Event ROI analytics with PDF/Excel export and AI executive summary
- Agent Orchestrator chaining all of the above into one workflow per lead, with retry logic
- Full IAM: email-based invitations, self-service + admin-initiated password reset, account lockout, 5-state user lifecycle, per-user event access scoping, onboarding wizard, security/adoption dashboards

## Technology stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Database | PostgreSQL via Drizzle ORM (hand-applied SQL migrations, no migration runner) |
| Auth | NextAuth v5 (JWT sessions, credentials provider) |
| AI | Google Gemini (`gemini-2.5-flash` by default) |
| Enrichment | Apollo.io API |
| CRM | HubSpot API |
| Cloud | AWS — EC2 (compute), RDS Postgres (database), S3 (voice notes/business cards/avatars), Transcribe (speech-to-text), SES (email, sandbox mode) |
| Infra | Docker (standalone Next.js build), Nginx + Let's Encrypt, no orchestration platform (single EC2 instance) |

## Release status

Currently at **Release 13.6**. See [18-release-history.md](18-release-history.md) for the full list. The application is deployed and reachable at https://tradeshow-agent.gtmtechsol.ai, running on a single t3.small EC2 instance with an RDS Postgres backend — this is a production-*demo* environment, not yet hardened for high-scale commercial production (see [19-known-limitations.md](19-known-limitations.md)).
