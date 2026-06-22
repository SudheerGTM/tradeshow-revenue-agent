-- Release 9: Follow-Up Intelligence Agent

CREATE TYPE followup_type AS ENUM (
  'email', 'linkedin', 'meeting_request', 'phone_call'
);

CREATE TYPE followup_priority AS ENUM (
  'high', 'medium', 'low'
);

CREATE TYPE followup_timing AS ENUM (
  'immediate', '24_hours', '3_days', '1_week', '2_weeks'
);

CREATE TYPE followup_status AS ENUM (
  'draft', 'approved', 'rejected'
);

CREATE TABLE followup_recommendations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id                 UUID REFERENCES events(id) ON DELETE SET NULL,
  lead_id                  UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  lead_score_id            UUID REFERENCES lead_scores(id) ON DELETE SET NULL,
  created_by_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,

  followup_type            followup_type NOT NULL,
  priority                 followup_priority NOT NULL DEFAULT 'medium',
  recommended_timing       followup_timing NOT NULL DEFAULT '1_week',

  subject_line             TEXT,
  message_content          TEXT,
  call_to_action           TEXT,
  reasoning                TEXT,
  personalization_points   JSONB,

  confidence_score         NUMERIC(5,2),
  needs_human_review       BOOLEAN NOT NULL DEFAULT FALSE,

  status                   followup_status NOT NULL DEFAULT 'draft',

  model_used               VARCHAR(200),
  raw_ai_response          JSONB,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX fr_tenant_idx     ON followup_recommendations (tenant_id);
CREATE INDEX fr_lead_idx       ON followup_recommendations (lead_id);
CREATE INDEX fr_status_idx     ON followup_recommendations (tenant_id, status);
CREATE INDEX fr_priority_idx   ON followup_recommendations (tenant_id, priority);
CREATE INDEX fr_created_idx    ON followup_recommendations (tenant_id, created_at DESC);
