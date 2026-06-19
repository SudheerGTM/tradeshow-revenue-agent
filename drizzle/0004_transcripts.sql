-- Release 5: Transcription Service

CREATE TYPE transcribe_status AS ENUM (
  'not_started', 'queued', 'in_progress', 'completed', 'failed'
);

CREATE TABLE transcripts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id              UUID REFERENCES events(id) ON DELETE SET NULL,
  lead_id               UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  voice_note_id         UUID NOT NULL REFERENCES voice_notes(id) ON DELETE CASCADE,
  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,

  transcribe_job_name   VARCHAR(500) NOT NULL UNIQUE,
  transcribe_status     transcribe_status NOT NULL DEFAULT 'queued',

  transcript_text       TEXT,
  transcript_json_s3_key VARCHAR(1000),
  language_code         VARCHAR(20) NOT NULL DEFAULT 'en-GB',

  confidence_score      DOUBLE PRECISION,
  failure_reason        TEXT,

  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tx_tenant_idx    ON transcripts (tenant_id);
CREATE INDEX tx_lead_idx      ON transcripts (lead_id);
CREATE INDEX tx_voice_note_idx ON transcripts (voice_note_id);
CREATE INDEX tx_status_idx    ON transcripts (tenant_id, transcribe_status);
