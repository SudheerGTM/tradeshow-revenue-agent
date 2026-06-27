# System Architecture Diagram

Companion to `docs/02-system-architecture.md` (prose) — this is the visual summary.

## High-level component view

```mermaid
flowchart TB
    subgraph Client
        Browser["Browser (booth_user / manager / tenant_admin / platform_admin)"]
    end

    subgraph "Next.js 16 App (App Router, standalone build)"
        Pages["Pages & Server Components<br/>(app)/dashboard, leads, admin/users, etc."]
        API["API Routes<br/>/api/leads, /api/users, /api/invitations,<br/>/api/followups, /api/crm-sync, ..."]
        Auth["NextAuth v5 (JWT)<br/>src/lib/auth.ts"]
        Agents["AI Agent Chain<br/>conversation intelligence → enrichment →<br/>scoring → follow-up draft → CRM sync prep → ROI"]
    end

    subgraph Data
        PG[("PostgreSQL (RDS)<br/>Drizzle ORM")]
    end

    subgraph "AWS Services"
        S3[("S3<br/>voice notes, business cards, avatars")]
        Transcribe["Transcribe<br/>voice note → text"]
        SES["SES (sandbox mode)<br/>invitation & reset emails"]
    end

    subgraph "External SaaS"
        Gemini["Google Gemini<br/>AI explain/draft/summarize only"]
        Apollo["Apollo.io<br/>contact/company enrichment"]
        HubSpot["HubSpot<br/>CRM sync (human-approved)"]
    end

    Browser -->|HTTPS via Nginx reverse proxy| Pages
    Browser --> API
    API --> Auth
    Pages --> Auth
    API --> PG
    Pages --> PG
    API --> Agents
    Agents --> PG
    Agents --> Gemini
    Agents --> Apollo
    Agents -->|prepare only, human approves before| HubSpot
    API --> S3
    API --> Transcribe
    Transcribe --> S3
    Auth --> SES
    API --> SES
```

## Deterministic vs AI boundary

A guardrail baked into the architecture, not just policy — worth diagramming explicitly since it's easy to violate accidentally when adding new agent code:

```mermaid
flowchart LR
    subgraph "AI-generated (Gemini)"
        Explain["Explanations"]
        Draft["Follow-up drafts"]
        Summary["Conversation summaries"]
    end
    subgraph "Deterministic (SQL/TypeScript only)"
        Score["Lead score"]
        ROI["ROI %"]
        Revenue["Expected/won revenue"]
    end
    Explain -.->|never writes to| Score
    Draft -.->|never writes to| Revenue
    Summary -.->|never writes to| ROI
```

## Request flow — CRM sync (human-in-the-loop, never automatic)

```mermaid
sequenceDiagram
    participant U as User (manager/tenant_admin)
    participant API as /api/crm-sync
    participant Agent as CRM Sync Agent
    participant HS as HubSpot
    U->>API: Request sync prepare
    API->>Agent: Build deal payload (deterministic fields)
    Agent->>API: Return prepared payload for review
    API->>U: Show prepared payload
    U->>API: Approve
    API->>HS: Create/update deal (only after approval)
    HS->>API: Confirmation
    API->>U: Sync complete
```
