-- Release 10: CRM Sync Agent

CREATE TYPE crm_sync_type AS ENUM (
  'contact', 'company', 'deal', 'task', 'full_sync'
);

CREATE TYPE crm_sync_status AS ENUM (
  'pending_approval', 'approved', 'queued', 'processing', 'completed', 'failed'
);

CREATE TABLE crm_sync_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id              UUID REFERENCES events(id) ON DELETE SET NULL,
  lead_id               UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,

  sync_type             crm_sync_type NOT NULL DEFAULT 'full_sync',
  sync_status           crm_sync_status NOT NULL DEFAULT 'pending_approval',

  hubspot_contact_id    VARCHAR(255),
  hubspot_company_id    VARCHAR(255),
  hubspot_deal_id       VARCHAR(255),
  hubspot_task_id       VARCHAR(255),

  sync_payload          JSONB,
  sync_response         JSONB,

  failure_reason        TEXT,

  approved_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX csj_tenant_idx  ON crm_sync_jobs (tenant_id);
CREATE INDEX csj_lead_idx    ON crm_sync_jobs (lead_id);
CREATE INDEX csj_status_idx  ON crm_sync_jobs (tenant_id, sync_status);
CREATE INDEX csj_created_idx ON crm_sync_jobs (tenant_id, created_at DESC);
