-- Release 14.4 — Event Multi-ICP (Unified Targeting Architecture)
--
-- Additive only: one new join table, plus a data-seeding INSERT that only
-- adds rows to that brand-new table. events.icp_profile_id is NOT dropped,
-- NOT modified, and no existing row in any table is changed — this is the
-- "safe migration strategy" called for in the R14.4 brief §12: existing
-- single Event ICP assignments are seeded into the join table so behavior
-- is preserved, and the old column stays as-is for backward compatibility
-- until a later release retires it once multi-ICP is proven out.

CREATE TABLE event_icp_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  icp_profile_id UUID NOT NULL REFERENCES icp_profiles(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, icp_profile_id)
);

CREATE INDEX event_icp_profiles_event_idx ON event_icp_profiles (event_id);
CREATE INDEX event_icp_profiles_icp_idx   ON event_icp_profiles (icp_profile_id);

-- Backfill: every event that already has a single icp_profile_id gets that
-- same assignment represented in the new join table too, so the unified
-- resolver (src/lib/icp/icp-resolver.ts) sees identical targeting for
-- pre-existing events as it did before this migration.
INSERT INTO event_icp_profiles (event_id, icp_profile_id)
SELECT id, icp_profile_id FROM events WHERE icp_profile_id IS NOT NULL
ON CONFLICT (event_id, icp_profile_id) DO NOTHING;
