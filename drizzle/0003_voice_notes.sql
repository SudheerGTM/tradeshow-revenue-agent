-- Release 4: Voice Capture Service
-- Run after 0002_events_leads.sql

CREATE TYPE recording_status     AS ENUM ('pending_upload', 'uploaded', 'failed', 'deleted');
CREATE TYPE transcription_status AS ENUM ('not_started', 'pending', 'completed', 'failed');

CREATE TABLE voice_notes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id             UUID REFERENCES events(id)  ON DELETE SET NULL,
  lead_id              UUID NOT NULL REFERENCES leads(id)   ON DELETE CASCADE,
  created_by_user_id   UUID REFERENCES users(id)   ON DELETE SET NULL,

  s3_bucket            VARCHAR(255)  NOT NULL,
  s3_key               VARCHAR(1000) NOT NULL,
  file_name            VARCHAR(255)  NOT NULL,
  file_type            VARCHAR(100)  NOT NULL,
  file_size_bytes      TEXT,
  duration_seconds     TEXT,

  recording_status     recording_status     NOT NULL DEFAULT 'pending_upload',
  transcription_status transcription_status NOT NULL DEFAULT 'not_started',

  retention_delete_at  TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX vn_tenant_idx ON voice_notes(tenant_id);
CREATE INDEX vn_lead_idx   ON voice_notes(lead_id);
CREATE INDEX vn_status_idx ON voice_notes(tenant_id, recording_status);
