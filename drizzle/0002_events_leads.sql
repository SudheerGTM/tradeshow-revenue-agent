-- Release 3: Lead Capture Service
-- Run after 0001_initial.sql

CREATE TYPE event_status AS ENUM ('upcoming', 'active', 'completed', 'cancelled');
CREATE TYPE lead_source  AS ENUM ('manual', 'qr_form', 'business_card');
CREATE TYPE lead_status  AS ENUM ('new', 'contacted', 'qualified', 'disqualified');

CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL,
  location    VARCHAR(255),
  start_date  DATE,
  end_date    DATE,
  status      event_status NOT NULL DEFAULT 'upcoming',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX events_tenant_idx ON events(tenant_id);
CREATE INDEX events_slug_idx   ON events(tenant_id, slug);

CREATE TABLE leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id             UUID REFERENCES events(id) ON DELETE SET NULL,
  created_by_user_id   UUID REFERENCES users(id)  ON DELETE SET NULL,

  first_name           VARCHAR(100) NOT NULL,
  last_name            VARCHAR(100),
  job_title            VARCHAR(150),
  company_name         VARCHAR(255) NOT NULL,

  email                VARCHAR(255),
  phone                VARCHAR(50),
  country              VARCHAR(100),

  source               lead_source NOT NULL DEFAULT 'manual',
  consent_given        BOOLEAN     NOT NULL DEFAULT FALSE,
  consent_timestamp    TIMESTAMPTZ,

  status               lead_status NOT NULL DEFAULT 'new',
  notes                TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX leads_tenant_idx     ON leads(tenant_id);
CREATE INDEX leads_event_idx      ON leads(event_id);
CREATE INDEX leads_status_idx     ON leads(tenant_id, status);
CREATE INDEX leads_created_by_idx ON leads(created_by_user_id);
