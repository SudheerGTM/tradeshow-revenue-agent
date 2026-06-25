# 13 — Folder Structure

```
src/
  app/
    (app)/                  All authenticated pages — this route group exists so
                             a single layout.tsx provides the shared sidebar/topbar
                             to every page nested under it. Pages NOT in this group
                             (login, capture, invite, forgot-password, reset-password)
                             intentionally render without that chrome.
      dashboard/            Main dashboard (largest single file in the app — 800+ lines,
                             see code-inspection-report.md)
      leads/                Leads list, lead detail (11-tab workspace), new-lead capture
      admin/users/          User management (invitations + lifecycle actions)
      profile/              Self-service profile, avatar, change password
      settings/             tenant settings, security dashboard
      welcome/               Onboarding wizard
      workflows/, agents/    Orchestrator UI
      opportunities/, pipeline/, followups/, crm-sync/, roi-analytics/, events/
    api/                    Every backend route — see 05-api-reference.md
    login/, invite/[token]/, forgot-password/, reset-password/, capture/[tenant]/[event]/
                             Public pages, outside the (app) route group
  components/
    ui/                     Generic primitives — Button, Input, Modal, Badge, Toast,
                             PageHeader, EmptyState. Reuse these before inventing new ones.
    admin/                  Admin-specific building blocks — RoleBadge, KpiGrid, UserDrawer
    lead-detail/            The 11-tab lead workspace components (one file per tab)
    workflow/                Shared workflow step-list UI
    (top-level files)        Feature components used across pages — VoiceRecorder,
                             QRBadgeScanner, BusinessCardScanner, BusinessCardGallery,
                             DuplicateLeadModal
  lib/
    agents/                 One file per pipeline agent (lead-scoring, followup-agent,
                             enrichment-agent, conversation-agent, roi-agent, crm sync)
                             — each exports a function used both by its own API route
                             AND by the orchestrator
    orchestrator/            types.ts (AgentAdapter interface — the AWS migration seam),
                             agents.ts (adapters), orchestrator.ts (engine),
                             event-bus.ts, policies.ts
    ai/                      provider.ts — the Gemini wrapper (conversation analysis,
                             business card OCR)
    enrichment/               apollo.ts
    integrations/             hubspot.ts (server-side only)
    email/                    Provider-agnostic email abstraction (types, console, ses,
                             templates, index)
    aws/                      s3.ts (presigned URLs, key builders)
    auth.ts                   NextAuth config + lockout logic
    permissions.ts             Role hierarchy + assignment rules
    audit.ts                   logAudit() + getRequestIp()
    password.ts                 Strength validation + reuse history check
    event-access.ts             Per-user event scoping helper
    tenant.ts                   Tenant lookup helpers
  db/
    schema.ts                  Single file, all tables/enums/types — see
                             04-database-schema.md and code-inspection-report.md
                             (997 lines — a refactor candidate)
    index.ts                   Drizzle client + pg.Pool setup
  types/
    next-auth.d.ts              Session/JWT type augmentation (id/role/tenantId)
drizzle/
  000N_*.sql                   Hand-applied migrations, numbered sequentially — see
                             09-deployment-guide.md for why there's no runner
docs/                          This documentation suite
scripts/
  seed.ts, seed-r3.ts           Local dev data seeding
```

## What's notably absent

- No `hooks/` folder — there are no extracted custom React hooks; state logic lives inline in client components.
- No `styles/` folder — styling is Tailwind utility classes inline, no separate CSS files beyond the global Tailwind entrypoint.
- No `tests/` folder — see [15-testing-guide.md](15-testing-guide.md) for what testing actually looks like in this project today (manual/browser-driven, not automated).
- No `middleware.ts` — route protection is page-level (`auth()` called in each server component), not centralized in Next.js middleware.
