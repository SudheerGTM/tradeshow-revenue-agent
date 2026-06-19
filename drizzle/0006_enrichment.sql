-- Release 7: Apollo Enrichment Agent

CREATE TYPE enrichment_status AS ENUM (
  'not_enriched', 'enriched', 'partially_enriched', 'failed', 'needs_review'
);

CREATE TABLE company_enrichment (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id               UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  company_name          VARCHAR(255),
  website               VARCHAR(500),
  linkedin_url          VARCHAR(500),

  industry              VARCHAR(200),
  sub_industry          VARCHAR(200),

  employee_count        VARCHAR(50),
  employee_range        VARCHAR(100),

  annual_revenue        VARCHAR(100),
  revenue_range         VARCHAR(100),

  headquarters          VARCHAR(255),
  founded_year          VARCHAR(10),
  company_description   TEXT,

  apollo_company_id     VARCHAR(255),
  enrichment_status     enrichment_status NOT NULL DEFAULT 'not_enriched',
  needs_review          BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason        TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ce_tenant_idx ON company_enrichment (tenant_id);
CREATE INDEX ce_lead_idx   ON company_enrichment (lead_id);
CREATE INDEX ce_status_idx ON company_enrichment (tenant_id, enrichment_status);

CREATE TABLE contact_enrichment (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id               UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  first_name            VARCHAR(100),
  last_name             VARCHAR(100),
  linkedin_url          VARCHAR(500),

  seniority             VARCHAR(100),
  department            VARCHAR(200),
  job_function          VARCHAR(200),

  apollo_contact_id     VARCHAR(255),
  enrichment_status     enrichment_status NOT NULL DEFAULT 'not_enriched',
  needs_review          BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason        TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cne_tenant_idx ON contact_enrichment (tenant_id);
CREATE INDEX cne_lead_idx   ON contact_enrichment (lead_id);
