-- Release 13.5 — Quick Capture (QR Badge Scan + Business Card OCR)

ALTER TYPE lead_source ADD VALUE 'qr_badge_scan';

ALTER TABLE leads
  ADD COLUMN qr_raw_text text,
  ADD COLUMN qr_scanned_at timestamptz,
  ADD COLUMN capture_duration_seconds integer;

CREATE TYPE ocr_status AS ENUM ('not_started', 'pending', 'completed', 'failed');
CREATE TYPE ocr_review_status AS ENUM ('pending_review', 'reviewed', 'rejected');

CREATE TABLE business_card_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,

  s3_bucket varchar(255) NOT NULL,
  s3_key varchar(1000) NOT NULL,
  file_name varchar(255) NOT NULL,
  file_type varchar(100) NOT NULL,
  file_size_bytes text,

  upload_status recording_status NOT NULL DEFAULT 'pending_upload',
  ocr_status ocr_status NOT NULL DEFAULT 'not_started',
  ocr_review_status ocr_review_status NOT NULL DEFAULT 'pending_review',
  ocr_raw_text text,
  extracted_fields_json text,

  card_consent_confirmed boolean NOT NULL DEFAULT false,
  card_consent_timestamp timestamptz,

  retention_delete_at timestamptz,
  deleted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bci_tenant_idx ON business_card_images (tenant_id);
CREATE INDEX bci_lead_idx ON business_card_images (lead_id);
CREATE INDEX bci_status_idx ON business_card_images (tenant_id, upload_status);
