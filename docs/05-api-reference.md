# 05 — API Reference

All routes are Next.js App Router route handlers under `src/app/api/`. Unless marked **Public**, every route requires a NextAuth session (`auth()` returns non-null) and is tenant-scoped to `session.user.tenantId`. Role gates use `isPlatformAdmin` / `isTenantAdmin` / `isManager` from `src/lib/permissions.ts` (hierarchy: platform_admin > tenant_admin > manager > booth_user). `booth_user` is generally restricted to leads/resources they created themselves.

Standard error shape: `{ "error": "message" }` with status 400 (validation), 401 (no session), 403 (forbidden), 404 (not found), 409 (conflict), 422 (blocked by business rule), or 502 (upstream AI/HubSpot/AWS failure).

## Leads

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/leads` | GET | booth_user: own only | Filters: search, status, eventId, classification, page. Event-access scoped. |
| `/api/leads` | POST | any role | Requires firstName, companyName, email-or-phone, consentGiven. Event-access checked if eventId given. |
| `/api/leads/:id` | GET | booth_user: own only | Returns `{ lead, history }` (audit entries) |
| `/api/leads/:id` | PATCH | booth_user: own only | Updates status/notes/contact fields |
| `/api/leads/check-duplicate` | GET | any | Query: email, firstName, companyName → `{ match }` or null |
| `/api/leads/scan-business-card` | POST | any | Stateless OCR via Gemini Vision; no DB write |
| `/api/leads/scan-events` | POST | any | Logs `qr_scanned`/`ocr_reviewed` audit events |
| `/api/leads/stats` | GET | any | Dashboard aggregate |

## Events

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/events` | GET | any | `?accessible=true` scopes to caller's assigned events |
| `/api/events` | POST | tenant_admin | |
| `/api/events/:id` | PATCH | tenant_admin | |
| `/api/events/:id/costs` | GET | any | `{ costs: [], total }` |
| `/api/events/:id/costs` | POST | manager+ | |
| `/api/events/:id/costs/:costId` | PATCH / DELETE | manager+ | |
| `/api/events/:id/roi` | GET | any (booth_user needs own leads at event) | Recalculates fresh each call |
| `/api/events/:id/report` | GET | any (booth_user needs own leads at event) | Metrics + summary + costs + top opportunities |
| `/api/events/:id/executive-summary` | POST | manager+ | Regenerates AI summary |
| `/api/events/:id/export/excel` | GET | tenant_admin | Binary XLSX |
| `/api/events/:id/export/pdf` | GET | tenant_admin | Binary PDF |

## Voice Notes

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/voice-notes` | GET | booth_user: own | `?lead_id=` required; presigned playback URLs |
| `/api/voice-notes/initiate-upload` | POST | any | leadId, fileName, fileType (audio/webm\|mp4\|mpeg\|wav\|ogg), fileSizeBytes |
| `/api/voice-notes/complete-upload` | POST | any | voiceNoteId |
| `/api/voice-notes/delete` | POST | booth_user: own | Soft delete; hard-deletes from S3 if manager+ |
| `/api/voice-notes/stats` | GET | any | `{ total, leadsWithNotes }` |

## Transcripts

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/transcripts` | GET | booth_user: own | `?lead_id=` required |
| `/api/transcripts/start` | POST | booth_user: own | Starts AWS Transcribe job; rejects if note >120s or not uploaded |
| `/api/transcripts/status` | POST/GET | booth_user: own | Polls + syncs AWS status |

## Business Cards

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/business-cards` | GET | booth_user: own | `?lead_id=` required; presigned image URLs |
| `/api/business-cards/initiate-upload` | POST | any | leadId, fileType (image/jpeg\|png\|webp, ≤5MB), ocrRawText, extractedFieldsJson, cardConsentConfirmed |
| `/api/business-cards/complete-upload` | POST | any | businessCardImageId |
| `/api/business-cards/delete` | POST | booth_user: own | Soft/hard delete (same pattern as voice notes) |

## Enrichment

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/enrichment` | GET | any | `?lead_id=` → `{ company, contact }` |
| `/api/enrichment/enrich` | POST | manager+ | Triggers Apollo lookup |

## Lead Scoring

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/lead-scores` | GET | any | `?lead_id=` → score history |
| `/api/lead-scores/generate` | POST | booth_user: own | Runs deterministic score + AI explanation |

## Follow-Ups

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/followups` | GET | booth_user: own | Filters: lead_id, priority, status, classification |
| `/api/followups/:id` | PATCH | manager+ | Approve/reject a draft |
| `/api/followups/generate` | POST | booth_user: own | leadId required; requires existing lead score |

## CRM Sync

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/crm-sync` | GET | booth_user: own | Filters: lead_id, status |
| `/api/crm-sync/prepare` | POST | booth_user: own | **No HubSpot write** — creates `pending_approval` row only |
| `/api/crm-sync/:id/approve` | POST | manager+ | Executes the actual HubSpot writes |
| `/api/crm-sync/:id/reject` | POST | manager+ | Deletes pending job, no sync |
| `/api/crm-sync/:id/retry` | POST | tenant_admin | Retries a failed sync |

## Opportunities

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/opportunities` | GET | booth_user: own | Filters: stage, priority, ownerId, eventId, status, leadId, sort |
| `/api/opportunities` | POST | not platform_admin | booth_user needs Hot/Warm lead or managerOverride |
| `/api/opportunities/prepare` | POST | any | Read-only preview (allowed/blockedReason) |
| `/api/opportunities/:id` | GET | booth_user: own | Full detail incl. lead/score/CRM job/activities |
| `/api/opportunities/:id` | PATCH | not platform_admin | booth_user limited to nextStep/riskNotes/stage; manager+ can edit amount/probability/owner |
| `/api/opportunities/:id/activities` | POST | not platform_admin/own for booth | Adds a manual note/call/email/meeting entry |

## Users

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/users` | GET | any | platform_admin sees all tenants; others see own |
| `/api/users` | POST | tenant_admin+ | **Legacy direct-create** — invitations are now the primary onboarding path |
| `/api/users/:id` | PATCH | tenant_admin+ | status/role/unlock — **never accepts a raw password** |
| `/api/users/:id/reset-password` | POST | tenant_admin+ | Sends secure reset-link email (admin-initiated reset) |
| `/api/users/:id/event-access` | GET/POST | any (POST: tenant_admin+) | `{ allEvents, eventIds }` |
| `/api/users/me` | GET/PATCH | any | Own profile; PATCH updates name/avatarUrl |
| `/api/users/me/avatar` | POST | any | Returns presigned S3 upload URL (≤2MB) |
| `/api/users/me/onboarding` | PATCH | any | Updates onboarding wizard step (0–5) |

## Invitations

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/invitations` | GET | tenant_admin+ | Lazily flips overdue `pending` → `expired` |
| `/api/invitations` | POST | tenant_admin+ | Creates + emails invite; 409 if email/active invite exists |
| `/api/invitations/:id/resend` | POST | tenant_admin+ | Regenerates token + expiry |
| `/api/invitations/:id/cancel` | POST | tenant_admin+ | |
| `/api/invitations/accept` | POST | **Public** (token-based) | token + password → creates the `users` row |

## Auth / Password (all Public)

| Route | Method | Notes |
|---|---|---|
| `/api/auth/forgot-password` | POST | Always returns `{success:true}` — no email enumeration |
| `/api/auth/reset-password` | POST | token + password; rejects weak/reused passwords |
| `/api/auth/change-password` | POST | **Authenticated**, not public — currentPassword + newPassword |

## Workflows & Agents

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/workflows` | GET | booth_user: own | Filters: lead_id, status |
| `/api/workflows/:id` | GET | booth_user: own | Full execution history |
| `/api/workflows/start` | POST | booth_user: own | leadId required; starts the 6-step orchestrator |
| `/api/workflows/:id/cancel` | POST | manager+ | |
| `/api/workflows/:id/retry` | POST | manager+ | |
| `/api/agents` | GET | any | Registry + health stats (success rate, avg runtime) |
| `/api/agent-policies` | GET | any | Read-only; no edit UI exists yet |

## Tenants (platform_admin only)

| Route | Method | Notes |
|---|---|---|
| `/api/tenants` | GET | List all |
| `/api/tenants` | POST | Create; 409 on slug conflict |
| `/api/tenants/:id` | PATCH | Update name/eventName/status |

## Conversation Insights

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/conversation-insights` | GET | booth_user: own | `?lead_id=` |
| `/api/conversation-insights/analyze` | POST | booth_user: own | Triggers Gemini analysis |

## Public capture (no auth)

| Route | Method | Notes |
|---|---|---|
| `/api/capture/:tenant/:event` | POST | Self-serve QR-form lead capture; resolves tenant/event by slug |

## Route count by area

Leads (8) · Events (11) · Voice Notes (5) · Transcripts (3) · Business Cards (4) · Enrichment (2) · Lead Scoring (2) · Follow-ups (3) · CRM Sync (5) · Opportunities (6) · Users (8) · Invitations (5) · Auth/Password (3) · Workflows/Agents (7) · Tenants (3) · Capture (1) · Conversation Insights (2) — **~66 total**.
