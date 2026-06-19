-- Release 6: Conversation Intelligence Agent

CREATE TYPE insight_input_source AS ENUM (
  'manual_transcript', 'transcript_table', 'lead_notes'
);

CREATE TYPE insight_urgency AS ENUM (
  'low', 'medium', 'high', 'unknown'
);

CREATE TYPE insight_status AS ENUM (
  'completed', 'failed', 'needs_review'
);

CREATE TABLE conversation_insights (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id                UUID REFERENCES events(id) ON DELETE SET NULL,
  lead_id                 UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  voice_note_id           UUID REFERENCES voice_notes(id) ON DELETE SET NULL,
  transcript_id           UUID REFERENCES transcripts(id) ON DELETE SET NULL,
  created_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,

  input_source            insight_input_source NOT NULL,
  input_text              TEXT NOT NULL,

  pain_points             JSONB,
  product_interest        JSONB,
  business_need           TEXT,
  urgency                 insight_urgency NOT NULL DEFAULT 'unknown',
  timeline                TEXT,
  budget_signal           TEXT,
  decision_maker_signal   TEXT,
  competitor_mentioned    TEXT,
  next_best_action        TEXT,

  summary                 TEXT,
  recommended_follow_up   TEXT,

  confidence_score        NUMERIC(5,2),
  ai_model_used           VARCHAR(200),
  ai_raw_response         JSONB,

  status                  insight_status NOT NULL DEFAULT 'completed',
  failure_reason          TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ci_tenant_idx  ON conversation_insights (tenant_id);
CREATE INDEX ci_lead_idx    ON conversation_insights (lead_id);
CREATE INDEX ci_status_idx  ON conversation_insights (tenant_id, status);
CREATE INDEX ci_urgency_idx ON conversation_insights (tenant_id, urgency);
