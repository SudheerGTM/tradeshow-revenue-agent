-- Release 11: Opportunity & Pipeline Intelligence Agent

CREATE TYPE opportunity_stage AS ENUM (
  'identified', 'qualified', 'meeting_scheduled', 'proposal_requested',
  'proposal_sent', 'negotiation', 'won', 'lost'
);

CREATE TYPE opportunity_priority AS ENUM (
  'high', 'medium', 'low'
);

CREATE TYPE opportunity_source AS ENUM (
  'trade_show', 'manual', 'crm_sync'
);

CREATE TYPE opportunity_status AS ENUM (
  'active', 'won', 'lost', 'archived'
);

CREATE TYPE opportunity_activity_type AS ENUM (
  'note', 'call', 'email', 'meeting', 'task', 'stage_change', 'crm_sync', 'follow_up'
);

CREATE TABLE opportunities (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id               UUID REFERENCES events(id) ON DELETE SET NULL,
  lead_id                UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  lead_score_id          UUID REFERENCES lead_scores(id) ON DELETE SET NULL,
  crm_sync_job_id        UUID REFERENCES crm_sync_jobs(id) ON DELETE SET NULL,

  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_user_id          UUID REFERENCES users(id) ON DELETE SET NULL,

  opportunity_name       VARCHAR(500) NOT NULL,
  company_name           VARCHAR(255) NOT NULL,
  contact_name            VARCHAR(255),

  stage                  opportunity_stage NOT NULL DEFAULT 'identified',
  priority               opportunity_priority NOT NULL DEFAULT 'medium',

  amount                 NUMERIC(12,2),
  probability            NUMERIC(5,4),
  expected_revenue       NUMERIC(12,2),

  expected_close_date   DATE,

  source                 opportunity_source NOT NULL DEFAULT 'trade_show',

  next_step              TEXT,
  risk_notes              TEXT,
  ai_recommendation       TEXT,

  status                 opportunity_status NOT NULL DEFAULT 'active',

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX opp_tenant_idx   ON opportunities (tenant_id);
CREATE INDEX opp_lead_idx     ON opportunities (lead_id);
CREATE INDEX opp_stage_idx    ON opportunities (tenant_id, stage);
CREATE INDEX opp_status_idx   ON opportunities (tenant_id, status);
CREATE INDEX opp_owner_idx    ON opportunities (tenant_id, owner_user_id);
CREATE INDEX opp_created_idx  ON opportunities (tenant_id, created_at DESC);

CREATE TABLE opportunity_activities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id        UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  lead_id               UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,

  activity_type         opportunity_activity_type NOT NULL,
  description           TEXT NOT NULL,
  metadata              JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX oa_tenant_idx       ON opportunity_activities (tenant_id);
CREATE INDEX oa_opportunity_idx  ON opportunity_activities (opportunity_id);
CREATE INDEX oa_created_idx      ON opportunity_activities (opportunity_id, created_at DESC);
