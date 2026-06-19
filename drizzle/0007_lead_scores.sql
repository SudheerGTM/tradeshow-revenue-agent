-- Release 8: Lead Scoring Agent

CREATE TYPE score_classification AS ENUM (
  'hot', 'warm', 'cold', 'needs_review'
);

CREATE TYPE score_status AS ENUM (
  'completed', 'failed', 'needs_review'
);

CREATE TABLE lead_scores (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id                    UUID REFERENCES events(id) ON DELETE SET NULL,
  lead_id                     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_by_user_id          UUID REFERENCES users(id) ON DELETE SET NULL,

  score                       NUMERIC(5,2) NOT NULL DEFAULT 0,
  classification              score_classification NOT NULL DEFAULT 'cold',

  company_fit_score           NUMERIC(5,2) NOT NULL DEFAULT 0,
  authority_score             NUMERIC(5,2) NOT NULL DEFAULT 0,
  need_score                  NUMERIC(5,2) NOT NULL DEFAULT 0,
  urgency_score               NUMERIC(5,2) NOT NULL DEFAULT 0,
  engagement_score            NUMERIC(5,2) NOT NULL DEFAULT 0,
  data_quality_score          NUMERIC(5,2) NOT NULL DEFAULT 0,

  estimated_opportunity_value NUMERIC(12,2),
  estimated_close_probability NUMERIC(5,4),
  expected_revenue            NUMERIC(12,2),

  score_explanation           TEXT,
  score_drivers               JSONB,
  risks                       JSONB,
  recommended_next_action     TEXT,

  confidence_score            NUMERIC(5,2),
  needs_human_review          BOOLEAN NOT NULL DEFAULT FALSE,

  model_used                  VARCHAR(200),
  raw_ai_response             JSONB,

  status                      score_status NOT NULL DEFAULT 'completed',
  failure_reason              TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ls_tenant_idx         ON lead_scores (tenant_id);
CREATE INDEX ls_lead_idx           ON lead_scores (lead_id);
CREATE INDEX ls_classification_idx ON lead_scores (tenant_id, classification);
CREATE INDEX ls_score_idx          ON lead_scores (tenant_id, score DESC);
CREATE INDEX ls_created_idx        ON lead_scores (tenant_id, created_at DESC);
