-- Release 14.2 — Configurable ICP Foundation
--
-- Additive only: new table + one nullable column. No existing row in any
-- table is modified. events.icp_profile_id defaults to NULL, which the ICP
-- resolver (src/lib/icp/icp-resolver.ts) treats as "use the tenant's active
-- default ICP profile, or no ICP context if none exists" — see
-- docs/RELEASE-14-CONFIGURABLE-ICP.md for the backward-compatibility design.

CREATE TYPE icp_status AS ENUM (
  'draft',
  'active',
  'inactive'
);

CREATE TABLE icp_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name                 VARCHAR(255) NOT NULL,
  description          TEXT,
  status               icp_status NOT NULL DEFAULT 'draft',
  version              INTEGER NOT NULL DEFAULT 1,
  configuration_json   JSONB NOT NULL,

  created_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX icp_profiles_tenant_idx        ON icp_profiles (tenant_id);
CREATE INDEX icp_profiles_tenant_status_idx ON icp_profiles (tenant_id, status);

ALTER TABLE events
  ADD COLUMN icp_profile_id UUID REFERENCES icp_profiles(id) ON DELETE SET NULL;

CREATE INDEX events_icp_profile_idx ON events (icp_profile_id);
