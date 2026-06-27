# Database ERD

Generated from `src/db/schema.ts` (26 tables). Grouped by domain for readability — see `docs/04-database-schema.md` for column-level detail; this is relationships only.

## Core tenancy & identity

```mermaid
erDiagram
    TENANTS ||--o{ USERS : has
    TENANTS ||--o{ USER_INVITATIONS : has
    TENANTS ||--o{ AUDIT_LOGS : scopes
    USERS ||--o{ PASSWORD_HISTORY : has
    USERS ||--o{ PASSWORD_RESET_TOKENS : requests
    USERS ||--o{ USER_EVENT_ACCESS : "scoped to events via"
    USERS ||--o{ USER_INVITATIONS : invites
    EVENTS ||--o{ USER_EVENT_ACCESS : "grants access to"
```

## Lead capture & enrichment pipeline

```mermaid
erDiagram
    TENANTS ||--o{ EVENTS : hosts
    TENANTS ||--o{ LEADS : owns
    EVENTS ||--o{ LEADS : "captured at"
    USERS ||--o{ LEADS : creates
    LEADS ||--o{ VOICE_NOTES : has
    LEADS ||--o{ BUSINESS_CARD_IMAGES : has
    VOICE_NOTES ||--|| TRANSCRIPTS : "transcribed into"
    LEADS ||--o{ TRANSCRIPTS : has
    LEADS ||--o{ CONVERSATION_INSIGHTS : derives
    TRANSCRIPTS ||--o| CONVERSATION_INSIGHTS : "analyzed into"
    LEADS ||--o{ COMPANY_ENRICHMENT : enriches
    LEADS ||--o{ CONTACT_ENRICHMENT : enriches
```

## Scoring, follow-up, CRM sync, opportunities (revenue chain)

```mermaid
erDiagram
    LEADS ||--o{ LEAD_SCORES : scored
    LEADS ||--o{ FOLLOWUP_RECOMMENDATIONS : drafts
    LEAD_SCORES ||--o| FOLLOWUP_RECOMMENDATIONS : informs
    LEADS ||--o{ CRM_SYNC_JOBS : syncs
    LEADS ||--o{ OPPORTUNITIES : becomes
    LEAD_SCORES ||--o| OPPORTUNITIES : informs
    CRM_SYNC_JOBS ||--o| OPPORTUNITIES : creates
    OPPORTUNITIES ||--o{ OPPORTUNITY_ACTIVITIES : logs
    USERS ||--o{ OPPORTUNITIES : owns
    USERS ||--o{ CRM_SYNC_JOBS : approves
```

## ROI attribution

```mermaid
erDiagram
    EVENTS ||--o{ EVENT_COSTS : incurs
    EVENTS ||--|| EVENT_ROI_METRICS : "rolls up to"
    TENANTS ||--o{ EVENT_COSTS : scopes
    TENANTS ||--o{ EVENT_ROI_METRICS : scopes
```

## Agent orchestration (Release 13)

```mermaid
erDiagram
    TENANTS ||--o{ WORKFLOW_RUNS : runs
    LEADS ||--o{ WORKFLOW_RUNS : triggers
    EVENTS ||--o{ WORKFLOW_RUNS : "scoped to"
    WORKFLOW_RUNS ||--o{ AGENT_EXECUTIONS : contains
    LEADS ||--o{ AGENT_EXECUTIONS : "executed for"
    AGENT_REGISTRY ||--o{ AGENT_EXECUTIONS : defines
    AGENT_REGISTRY ||--o{ AGENT_POLICIES : "governed by"
```

## Cross-cutting

- Every business table carries a `tenantId` foreign key (`onDelete: cascade`) — see `docs/08-multi-tenant-architecture.md` for how this is enforced at the query layer, not just the schema layer.
- `createdByUserId` (or equivalent, e.g. `ownerUserId`, `approvedByUserId`) appears on most operational tables with `onDelete: set null` — deleting a user does not cascade-delete their historical work, it just orphans the foreign key.
- `audit_logs` references both `tenants` and `users` with `onDelete: set null` and is append-only (see `docs/07-authentication-security.md`).
