# Changelog

All notable changes to Trade Show Revenue Agent, release by release. Dates are approximate (derived from commit history, not always exact).

## Release 13.6 — Identity, Access Management & User Adoption

**Major features:** Email-based invitations (`user_invitations` table, 7-day token expiry, no `users` row until accepted); self-service + admin-initiated password reset via secure single-use email links; account lockout after 5 failed logins; 5-state user lifecycle (invited/active/inactive/suspended/locked); password history + reuse prevention (last 5); per-user event access scoping; 5-step onboarding wizard; Security Dashboard (`/settings/security`); User Adoption dashboard section; expanded audit logging with IP address capture.

**Database changes:** `0014_iam.sql` — new tables `password_history`, `user_invitations`, `user_event_access`, `password_reset_tokens`; `users` gains `failedLoginAttempts`, `lockedAt`, `lastLoginAt`, `lastActivityAt`, `sessionCount`, `avatarUrl`, `allEvents`, `onboardingStep`, `onboardingCompletedAt`; `audit_logs` gains `ipAddress`; `user_status` enum extended with `invited`/`suspended`/`locked`.

**Breaking changes:** `PATCH /api/users/:id` no longer accepts a raw `password` field — admin password resets now go through the email-link flow. Invited users have no `users` row until they accept (anything that assumed a user row exists immediately on invite would break).

**Bug fixes:** Fixed `session.user.id` never being populated by NextAuth callbacks (silently writing `NULL` to `created_by_user_id`/audit `user_id` everywhere) — see [16-troubleshooting.md](16-troubleshooting.md).

**Known issues at release:** AWS SES in sandbox mode (only `info@gtmtechsol.com` can receive real email); an unexplained password drift on `admin@demo.com` in production was found and worked around but not root-caused; dashboard N+1 query performance issue pre-existing, not addressed by this release.

---

## Release 13.5 — Quick Capture (QR Badge Scan + Business Card OCR)

**Major features:** Quick Capture hub on `/leads/new` (Scan Badge QR / Scan Business Card / Manual Entry); client-side QR decoding (`jsqr`) with a vCard/MECARD/JSON/query-param fallback parser chain; business card photo capture + Gemini Vision OCR with a mandatory human-review step before any data is trusted; duplicate lead detection (email or name+company match) with a resolution modal; permanent business-card image storage (S3 + DB record) with consent capture; dashboard adoption metrics (QR scans, card scans, quick-capture vs. manual leads, average capture time).

**Database changes:** `0013_quick_capture.sql` — new table `business_card_images`; `leads` gains `qrRawText`, `qrScannedAt`, `captureDurationSeconds`; `lead_source` enum gains `qr_badge_scan`; new enums `ocr_status`, `ocr_review_status`.

**Breaking changes:** None.

**Bug fixes (post-release):** Fixed a black/frozen camera preview on iOS Safari specifically (stream attached before the conditionally-mounted `<video>` element existed in the DOM) — see [16-troubleshooting.md](16-troubleshooting.md).

**Known issues at release:** None new; inherited the pre-existing AWS Transcribe subscription gap.

---

## Release 13 — Agent Orchestrator & Workflow Engine

**Major features:** Chains all six pipeline agents (Conversation Intelligence, Enrichment, Lead Scoring, Follow-Up, CRM Sync, ROI) into one "Lead Qualification Workflow" per lead; `AgentAdapter` interface as an explicit seam for a future AWS Step Functions/Bedrock AgentCore swap; retry logic with failure classification (temporary/validation/permission) and exponential backoff; in-process event bus; configurable agent policies (e.g. score thresholds gating CRM sync).

**Database changes:** `0012_orchestrator.sql` — new tables `agent_registry`, `workflow_runs`, `agent_executions`, `agent_policies`, with seed data for all six agents and three example policies.

**Breaking changes:** None.

**Known issues at release:** Orchestrator runs synchronously in-process (no queue/worker) — acceptable at current scale, flagged as a future scaling concern.

---

## Release 12 — Trade Show ROI Analytics & Executive Reporting

**Major features:** Deterministic per-event ROI calculation (cost, pipeline, ROI%, cost-per-lead/qualified-lead/opportunity); AI executive summary layered on top of the computed numbers (never recalculates, falls back to a deterministic template if Gemini is unavailable); PDF and Excel export (tenant_admin only).

**Database changes:** `0011_event_roi.sql` — new tables `event_costs`, `event_roi_metrics`.

---

## Release 11 — Opportunity & Pipeline Intelligence Agent

**Major features:** Kanban-style opportunity pipeline, stage-based close probabilities, opportunity activity log.

**Database changes:** `0010_opportunities.sql` — new tables `opportunities`, `opportunity_activities`.

---

## Release 10 — CRM Sync Agent

**Major features:** HubSpot integration — prepare → human approval → sync, never automatic. Duplicate detection against existing HubSpot contacts/companies.

**Database changes:** `0009_crm_sync_jobs.sql` — new table `crm_sync_jobs`.

---

## Release 9 — Follow-Up Intelligence Agent

**Major features:** AI-drafted follow-up messages (email/LinkedIn/meeting/call script) based on lead classification — drafts only, no send capability exists.

**Database changes:** `0008_followup_recommendations.sql` — new table `followup_recommendations`.

---

## Release 8 — Lead Scoring Agent

**Major features:** Deterministic 100-point scoring model (Company Fit/Authority/Need/Urgency/Engagement/Data Quality) with AI-generated explanation layered on top — AI explains, never sets, the score.

**Database changes:** `0007_lead_scores.sql` — new table `lead_scores`.

---

## Release 7 — Apollo Enrichment Agent

**Major features:** Company and contact enrichment via Apollo.io, two-step contact lookup to work around a deprecated endpoint.

**Database changes:** `0006_enrichment.sql` — new tables `company_enrichment`, `contact_enrichment`.

---

## Release 6 — Conversation Intelligence Agent (Gemini)

**Major features:** AI extraction of pain points, urgency, business need, and next-best-action from conversation transcripts/notes.

**Database changes:** `0005_conversation_insights.sql` — new table `conversation_insights`.

---

## Release 5 — Amazon Transcribe transcription service

**Major features:** Async speech-to-text for recorded voice notes.

**Database changes:** `0004_transcripts.sql` — new table `transcripts`.

**Known issues at release:** AWS account was never subscribed to Transcribe — this gap has persisted through every subsequent release.

---

## Releases 1–4 — Foundation

**Major features:** Project scaffold, multi-tenant + RBAC user management, lead capture (manual + public QR form), voice note recording and S3 upload.

**Database changes:** `0001_initial.sql` (tenants, users, audit_logs), `0002_events_leads.sql` (events, leads), `0003_voice_notes.sql` (voice_notes).
