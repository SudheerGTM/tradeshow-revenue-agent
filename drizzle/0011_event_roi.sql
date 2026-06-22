-- Release 12: Trade Show ROI Analytics & Executive Reporting

CREATE TYPE event_cost_category AS ENUM (
  'booth', 'travel', 'hotel', 'marketing', 'sponsorship', 'staff', 'collateral', 'other'
);

CREATE TABLE event_costs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  cost_category       event_cost_category NOT NULL DEFAULT 'other',
  description         TEXT,
  amount              NUMERIC(12,2) NOT NULL DEFAULT 0,

  created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ec_tenant_idx ON event_costs (tenant_id);
CREATE INDEX ec_event_idx  ON event_costs (event_id);

CREATE TABLE event_roi_metrics (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id                    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  total_event_cost            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_leads                 INTEGER NOT NULL DEFAULT 0,
  qualified_leads             INTEGER NOT NULL DEFAULT 0,
  hot_leads                   INTEGER NOT NULL DEFAULT 0,
  opportunities_created       INTEGER NOT NULL DEFAULT 0,

  pipeline_generated          NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_revenue            NUMERIC(12,2) NOT NULL DEFAULT 0,
  won_revenue                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  lost_revenue                NUMERIC(12,2) NOT NULL DEFAULT 0,

  roi_percentage              NUMERIC(8,2),
  cost_per_lead                NUMERIC(12,2),
  cost_per_qualified_lead      NUMERIC(12,2),
  cost_per_opportunity         NUMERIC(12,2),

  executive_summary           TEXT,
  summary_generated_at        TIMESTAMPTZ,
  summary_confidence_score    NUMERIC(5,2),
  summary_model_used          VARCHAR(200),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id)
);

CREATE INDEX erm_tenant_idx ON event_roi_metrics (tenant_id);
CREATE INDEX erm_event_idx  ON event_roi_metrics (event_id);
