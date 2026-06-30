-- Release 13.8 — Controlled tenant self-registration and provisioning

CREATE TYPE access_request_status AS ENUM (
  'requested',
  'under_review',
  'approved',
  'rejected',
  'provisioned'
);

CREATE TABLE tenant_access_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Prospect identity
  company_name        VARCHAR(255) NOT NULL,
  company_website     VARCHAR(255),
  contact_name        VARCHAR(255) NOT NULL,
  contact_email       VARCHAR(255) NOT NULL,
  phone               VARCHAR(50),
  country             VARCHAR(100),

  -- Intent details
  event_name          VARCHAR(255),
  expected_users      INTEGER,
  crm_system          VARCHAR(100),
  use_case            TEXT,
  message             TEXT,

  -- Anti-spam / rate-limit metadata (stored for audit; not exposed publicly)
  honeypot_triggered  BOOLEAN NOT NULL DEFAULT false,
  ip_address          VARCHAR(64),
  user_agent          VARCHAR(512),

  -- Workflow state
  status              access_request_status NOT NULL DEFAULT 'requested',
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  admin_notes         TEXT,

  -- Outcome
  created_tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tar_status_idx   ON tenant_access_requests (status);
CREATE INDEX tar_email_idx    ON tenant_access_requests (contact_email);
CREATE INDEX tar_created_idx  ON tenant_access_requests (created_at DESC);
