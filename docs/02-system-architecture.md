# 02 — System Architecture

## High-level architecture

```mermaid
flowchart TB
    subgraph Client
        Browser["Browser (booth staff / admin)"]
    end

    subgraph App["Next.js 16 App (single EC2 instance, Docker)"]
        Pages["App Router pages\nsrc/app/(app)/*"]
        API["API Routes\nsrc/app/api/**/route.ts"]
        Auth["NextAuth v5\nsrc/lib/auth.ts"]
        Agents["Agent libs\nsrc/lib/agents/*"]
        Orchestrator["Orchestrator\nsrc/lib/orchestrator/*"]
    end

    subgraph Data["Data layer"]
        RDS[("PostgreSQL\nAWS RDS")]
    end

    subgraph External["External services"]
        Gemini["Google Gemini\n(AI)"]
        Apollo["Apollo.io\n(enrichment)"]
        HubSpot["HubSpot\n(CRM)"]
        S3[("AWS S3\nvoice/cards/avatars")]
        Transcribe["AWS Transcribe"]
        SES["AWS SES\n(email)"]
    end

    Browser -->|HTTPS via Nginx| Pages
    Browser --> API
    Pages --> API
    API --> Auth
    API --> Agents
    Agents --> Orchestrator
    API --> RDS
    Agents --> Gemini
    Agents --> Apollo
    Agents --> HubSpot
    API --> S3
    API --> Transcribe
    API --> SES
```

## Request flow

All UI is server-rendered via Next.js App Router. Pages under `src/app/(app)/` are server components that query the database directly (no separate backend) and pass data to client components for interactivity. API routes under `src/app/api/` handle mutations and anything that needs to run server-side logic (auth checks, AI calls, S3 presigning).

There is **no standalone backend service** — Next.js's API routes are the entire backend. There is **no message queue or background worker** — the Agent Orchestrator runs synchronously inside the HTTP request that starts a workflow (see [06-ai-agent-architecture.md](06-ai-agent-architecture.md)).

## Layers

| Layer | Responsibility | Key paths |
|---|---|---|
| Pages (Server Components) | Auth-gated UI, direct DB reads for display | `src/app/(app)/**/page.tsx` |
| Pages (Client Components) | Interactivity, forms, client-side state | `src/app/(app)/**/*Client.tsx` |
| API Routes | Mutations, auth checks, AI/external API calls, S3 presigning | `src/app/api/**/route.ts` |
| Agent libraries | Business logic for each pipeline stage | `src/lib/agents/*` |
| Orchestrator | Chains agents into one workflow with retry | `src/lib/orchestrator/*` |
| Data access | Drizzle ORM schema + queries | `src/db/schema.ts`, inline in routes |
| Auth | Session/JWT, role checks, lockout | `src/lib/auth.ts`, `src/lib/permissions.ts` |
| Integrations | External API clients | `src/lib/enrichment/apollo.ts`, `src/lib/integrations/hubspot.ts`, `src/lib/aws/*`, `src/lib/email/*` |

## Why no separate backend / queue

This was a deliberate simplicity choice for the project's current scale (single small EC2 instance, modest lead volume per event). The Agent Orchestrator's `AgentAdapter` interface (`src/lib/orchestrator/types.ts`) is explicitly designed as the seam for migrating to AWS Step Functions or Bedrock AgentCore later without touching the agent logic itself — see [17-future-roadmap.md](17-future-roadmap.md).

## Deployment architecture

```mermaid
flowchart LR
    Internet["Internet"] -->|HTTPS 443| Nginx["Nginx\n(Let's Encrypt TLS)"]
    Nginx -->|HTTP 3000| Docker["Docker container\ntradeshow-agent:latest"]
    Docker --> RDS[("RDS PostgreSQL\nprivate subnet")]
    Docker --> S3[("S3 bucket")]
    Docker -->|IAM instance role| AWSAPIs["Transcribe / SES"]

    subgraph EC2["EC2 t3.small (2GB RAM + 2GB swap)"]
        Nginx
        Docker
    end
```

See [10-aws-infrastructure.md](10-aws-infrastructure.md) for the full breakdown including why swap was added (build-time OOM under load) and [09-deployment-guide.md](09-deployment-guide.md) for the deploy procedure.

## Multi-tenancy

Every business table carries a `tenant_id` and every query is scoped to the caller's tenant except `platform_admin`-only routes. See [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md).

Tenant resolution by subdomain (e.g. `demo.tradeshow-agent.gtmtechsol.ai`) is implemented at the `src/proxy.ts` layer (this fork's `middleware.ts` equivalent — see root `AGENTS.md`) and enforced in `authorize()` (`src/lib/auth.ts`). The apex domain remains tenant-agnostic (legacy behavior) until wildcard DNS is enabled — see [08-multi-tenant-architecture.md](08-multi-tenant-architecture.md)'s "Subdomain strategy" section for the apex-vs-subdomain distinction, and `docs/deployment-checklist.md` for the prepared (not yet executed) rollout plan.
