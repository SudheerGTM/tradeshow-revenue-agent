# Release 14 — Configurable ICP Foundation

**Status: not started. This document is the R14.1 current-state assessment and proposed phase plan, for user approval before any implementation begins.** Nothing in this document has been built. Do not start R14.2+ work from this doc alone — get explicit sign-off on scope first, per [PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md).

## Why this release

Trade Show Revenue Agent is multi-tenant at the infrastructure level (isolated data per tenant — see [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md)), but **not** multi-tenant at the ideal-customer-profile level. The AI/scoring logic was written for one vertical (logistics/supply-chain, per [01-project-overview.md](01-project-overview.md)) and that assumption is baked directly into product code, not configuration. A tenant in a different industry (e.g. medical devices, fintech, manufacturing) gets logistics-shaped scoring today regardless of who they actually sell to.

The target end-state, per the original product brief:

```
One Trade Show Revenue Agent
        ↓
   Multiple Tenants
        ↓
Configurable ICP Profiles
        ↓
  Different Industries
```

**Explicitly not the goal:** separate forked applications per industry, or a generic multi-agent-per-industry architecture. See [Guiding principle](#guiding-principle-for-r14) below — this is the single most important constraint on scope.

## R14.1 — Current-state assessment (this document)

### Where the fixed-ICP assumption actually lives in code

Verified by direct inspection, not inference:

| # | Location | What's hardcoded | Fix requires |
|---|---|---|---|
| 1 | `src/lib/agents/lead-scoring.ts:285-289` | Company Fit scoring gives a **+5 bonus** (capped at 25) when `company.industry` contains `"logistics"`, `"transport"`, `"supply chain"`, or `"freight"` — a literal string-match against four hardcoded terms | Replace with a per-tenant (or per-ICP-profile) target-industry list, matched the same way |
| 2 | `src/lib/agents/lead-scoring.ts` (Authority component) | Seniority/title keyword matching (`ceo`, `cto`, `coo`, `director`, `vp`, `head of`, `manager`) is a fixed list — reasonable as a general B2B heuristic, but doesn't reflect a tenant's specific target *departments* | Should become ICP-aware ("decision maker" title list may differ, e.g. Procurement vs. Engineering vs. IT depending on tenant) |
| 3 | `src/db/schema.ts` — `tenants` table | No ICP-related columns or related table exists at all | New `icp_profiles` table (see [R14.2](#r142--icp-data-model-proposed)) |
| 4 | `src/lib/agents/conversation-agent.ts` / Gemini prompt in `src/lib/ai/provider.ts` | Prompt has no notion of a target industry, persona, or pain-point taxonomy — it's a generic "extract pain points/urgency/next-best-action" prompt | Needs an ICP-context injection point (see [R14.5](#r145--conversation-intelligence-integration-proposed)) |
| 5 | `src/lib/agents/followup-agent.ts` | Follow-up strategy is keyed only on lead classification (hot/warm/cold), not on any ICP-specific messaging angle | Needs ICP-aware personalization inputs (see [R14.7](#r147--follow-up-integration-proposed)) |
| 6 | Seed data (`scripts/seed.ts`) | Demo tenants/copy assume a logistics-adjacent business, per [01-project-overview.md](01-project-overview.md) | Not a code fix — just context for why the defaults look the way they do |

**What is *not* hardcoded** — already tenant-scoped and reusable as-is:
- Tenant isolation itself (every table has `tenant_id`, enforced consistently — see [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md)).
- The `tenants` table already carries `eventName`, so there's precedent for tenant-level descriptive metadata.
- `agent_policies` (seeded config gates, e.g. "Minimum score for CRM recommendation") is exactly the kind of per-tenant-configurable-value mechanism an ICP scoring-weight override should follow the shape of — see [06-ai-agent-architecture.md](06-ai-agent-architecture.md).
- The Lead Scoring formula's six-component structure (Company Fit / Authority / Need / Urgency / Engagement / Data Quality) is generic — only the *inputs* to Company Fit and Authority are industry-specific, not the shape of the formula itself. R14 should reuse this structure, not replace it.

### Tenant/subdomain context relevant to R14

Not part of R14's own scope, but load-bearing context discovered during this handoff (see [PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md) and [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md)):
- Real tenant-subdomain resolution (`{subdomain}.tradeshow-agent.gtmtechsol.ai`) is implemented in `src/proxy.ts`/`src/lib/tenant.ts`/`src/lib/auth.ts`, verified working, but **not yet publicly live** (wildcard DNS/SSL/Nginx phases pending explicit approval — see `docs/wildcard-rollout-runbook.md`). Every real user today authenticates via the single apex domain and is scoped by `session.user.tenantId`, not by subdomain.
- This matters for R14.3 (ICP admin UI) only in that the UI should be reached via the normal authenticated app (tenant settings), **not** designed around subdomain-based tenant selection — that mechanism exists for future public-facing use, not as the primary tenant-resolution path today.

## Guiding principle for R14

**Immediate goal:** One Trade Show Agent → Multiple Configurable ICPs (per tenant, per event).
**Explicitly deferred to a later, unscoped release:** Multiple Agents → Multiple ICPs (i.e., don't build a plugin/agent-per-industry system now).

Concretely, this means:
- One `icp_profiles` table, one Lead Scoring agent, one Conversation Intelligence agent — parameterized by the active ICP, not forked per industry.
- No new orchestrator steps, no new agent adapters, no new AI provider abstraction. R14 is a **data + prompt-input** change, not an **architecture** change.
- Resist building a generic "rules engine" or "plugin system" for ICP logic. A structured JSON config consumed by the existing deterministic scoring function and existing Gemini prompts is sufficient — see [R14.2](#r142--icp-data-model-proposed).

## Proposed phases

### R14.1 — ICP current-state assessment
This document. **Deliverable:** user approval of the phase plan and data model below before R14.2 begins.

### R14.2 — ICP data model (proposed)

New table, following the existing schema conventions in `src/db/schema.ts` (tenant-scoped, indexed, `$inferSelect`/`$inferInsert` exported types — see [14-coding-standards.md](14-coding-standards.md)):

```
icp_profiles
  id                 uuid PK
  tenantId           uuid → tenants (CASCADE)
  name               varchar            -- e.g. "Default", "Medical Devices EU"
  version            integer default 1  -- bump on every meaningful edit, per spec's "ICP version" field
  isActive           boolean default false  -- exactly one active profile per tenant (or per tenant+event, see below)
  isDefault          boolean default false  -- fallback when an event has no explicit assignment

  -- Company Fit
  targetIndustries    jsonb  -- string[]
  targetSubindustries jsonb  -- string[]
  targetCountries     jsonb  -- string[]
  employeeSizeMin     integer
  employeeSizeMax     integer
  revenueRangeMin     numeric
  revenueRangeMax     numeric
  targetTechnologies  jsonb  -- string[] (matched against Apollo tech-stack data if/when available)
  exclusions          jsonb  -- string[] (industries/keywords that should suppress, not just fail to bonus)

  -- Persona Fit
  targetDepartments   jsonb  -- string[]
  targetTitles        jsonb  -- string[]
  targetSeniority     jsonb  -- string[] (reuses existing seniority vocabulary from contact_enrichment)
  decisionMakerTitles jsonb  -- string[]
  influencerTitles    jsonb  -- string[]

  -- Pain Points
  painPointKeywords    jsonb  -- string[] — informs Conversation Intelligence prompt + Need/Pain scoring
  businessObjectives   jsonb  -- string[]
  useCases             jsonb  -- string[]

  -- Buying Signals
  highSignalKeywords     jsonb  -- string[]
  mediumSignalKeywords   jsonb  -- string[]
  negativeSignalKeywords jsonb  -- string[]

  -- Products / Solutions
  products              jsonb  -- string[] — tenant's own offerings, for follow-up personalization

  -- Scoring weights (overrides — see below)
  scoringWeights        jsonb  -- { companyFit, authority, need, urgency, engagement, dataQuality } — must sum to 100; falls back to today's fixed 25/20/20/15/10/10 split if unset

  createdAt / updatedAt
```

Indexes: `(tenantId)`, `(tenantId, isActive)`.

**Event → ICP assignment:** rather than a separate join table, add a nullable `events.icpProfileId → icp_profiles (SET NULL)`. `null` means "use the tenant's default/active profile" — this keeps the common case (one ICP per tenant) a no-op for event creation, while still allowing a specific event to override it (e.g. a tenant exhibiting at two different verticals' trade shows in the same quarter).

**Scoring weights validation:** the six weights must sum to 100 to preserve the existing 0–100 scale — validate at the API layer (`POST`/`PATCH /api/icp-profiles`), not just trust client input, consistent with [14-coding-standards.md](14-coding-standards.md)'s tenant-scoping/validation conventions.

**Migration:** `drizzle/0016_icp_profiles.sql`, applied by hand per [09-deployment-guide.md](09-deployment-guide.md) (no migration runner exists — this is unrelated technical debt, not something to fix as part of R14, see [docs/TECHNICAL-DEBT.md](TECHNICAL-DEBT.md)).

### R14.3 — ICP admin UI (proposed)
A new `/settings/icp` page (tenant_admin+), following the existing Tenant Settings page pattern (`src/app/(app)/settings/tenant/page.tsx`). CRUD for `icp_profiles`, an explicit "Set Active" action, and a read-only preview showing how the current scoring weights map to point values (so an admin editing weights can see the effect before saving). Reuse `src/components/ui/*` primitives per [14-coding-standards.md](14-coding-standards.md) — don't invent new form components.

### R14.4 — Event → ICP assignment (proposed)
Add the ICP picker to the existing event-create/edit form (`src/app/api/events/route.ts` and its UI). Default to the tenant's active/default profile; allow explicit override. No new page needed.

### R14.5 — Conversation Intelligence integration (proposed)
Inject the active ICP's `painPointKeywords`/`businessObjectives`/`useCases`/`targetIndustries` into the Gemini prompt in `src/lib/ai/provider.ts`'s `analyzeConversation` as additional context (not a hard filter — the model should still report what it actually hears, just with better-calibrated pattern-matching for this tenant's business). This is a prompt-input change only; the output schema (`pain_points[]`, `urgency`, etc. — see [06-ai-agent-architecture.md](06-ai-agent-architecture.md)) does not need to change.

### R14.6 — Lead Scoring integration (proposed)
This is the core of R14. In `src/lib/agents/lead-scoring.ts`:
- Company Fit: replace the hardcoded logistics-keyword match with a lookup against the active ICP's `targetIndustries`/`targetSubindustries`/`exclusions`.
- Authority: replace the hardcoded title/seniority keyword lists with the active ICP's `decisionMakerTitles`/`influencerTitles`/`targetSeniority`, falling back to today's generic list if no ICP is configured (so tenants that never touch R14 keep working exactly as before — **this must be backward-compatible by default**, per the "don't over-engineer, don't break what works" guardrail in [PROJECT-HANDOFF.md](../PROJECT-HANDOFF.md)).
- Weights: read `scoringWeights` from the active ICP (defaulting to the current fixed 25/20/20/15/10/10 split) instead of the literal numbers currently inline in the function.
- **The formula stays deterministic.** AI still only explains the score afterward — this guardrail (see [Agent Guardrails](../PROJECT-HANDOFF.md#9-agent-guardrails)) is non-negotiable and R14 does not touch it.

### R14.7 — Follow-up integration (proposed)
Pass the active ICP's `products`/`businessObjectives` into `src/lib/agents/followup-agent.ts`'s prompt context, so drafts can reference the tenant's actual offering instead of generic language. Strategy-by-classification logic (hot/warm/cold → channel/timing/priority) stays as-is — it's not industry-specific.

### R14.8 — ICP testing (proposed)
No automated test suite exists in this repo (see [15-testing-guide.md](15-testing-guide.md)) — R14 testing follows the same manual/browser-driven practice already established: create two ICP profiles with deliberately different target industries/titles, run the same synthetic lead through Lead Scoring under each, and confirm the score and classification differ in the expected direction. Regression-check that a tenant with **no** ICP profile configured still scores exactly as today (the backward-compatibility requirement from R14.6).

### R14.9 — Multi-industry validation (proposed)
Requires at least one real (or realistic seed) tenant outside the logistics/supply-chain vertical exercising the full pipeline (capture → conversation intelligence → scoring → follow-up) with its own ICP profile, to confirm the "one agent, many ICPs" premise actually holds outside the vertical the app was originally built around.

## Explicitly out of scope for R14

- Multiple agents/agent-per-industry architecture (see [Guiding principle](#guiding-principle-for-r14)).
- Any change to the Apollo enrichment call shape, CRM sync logic, or ROI calculation — none of these are industry-specific today and none need to become ICP-aware in this release.
- Wildcard subdomain / public tenant self-registration rollout — tracked separately in `docs/wildcard-rollout-runbook.md` and Release 13.8's access-request flow; unrelated to ICP configuration.
- A generic "rules engine" for arbitrary scoring logic — the six-component structure stays fixed; only its *inputs* and *weights* become configurable.

## Open questions for the user before R14.2 starts

1. Is one ICP profile per tenant sufficient for v1, with per-event override as an explicit opt-in (as designed above), or does the initial cut need multiple simultaneously-active profiles per tenant from day one?
2. Should `scoringWeights` be admin-editable in R14.3, or should the six-component split stay fixed (25/20/20/15/10/10) for this release and only the *inputs* (industries/titles/keywords) become configurable, with weight-editing deferred to a later release? (Smaller, safer scope if deferred.)
3. Who owns writing the first non-logistics ICP profile for R14.9 validation — product/sales, or should a synthetic one be constructed from seed data?
