-- Release 14.3 — Configurable ICP Administration
--
-- Additive only: one nullable column. No existing row modified.
-- tenants.default_icp_profile_id is nullable and separate from
-- icp_profiles.status — a tenant can have multiple "active" ICP profiles
-- (different events target different audiences) without one of them
-- automatically being "the" default. See src/lib/icp/icp-resolver.ts for
-- the resolution order this enables.

ALTER TABLE tenants
  ADD COLUMN default_icp_profile_id UUID REFERENCES icp_profiles(id) ON DELETE SET NULL;

CREATE INDEX tenants_default_icp_profile_idx ON tenants (default_icp_profile_id);
