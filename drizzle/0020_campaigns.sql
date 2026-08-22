-- Release 14.4 — Campaign Foundation (Unified Targeting Architecture)
--
-- Additive only: two new tables + one nullable FK column. No existing row
-- in any table is modified. Campaign lifecycle (draft/active/completed/
-- archived) is explicit, not date-derived — see the R14.4 brief §13: this
-- deliberately avoids recreating the Event-status ambiguity fixed in
-- migration 0018/the event-status.ts utility.

CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'completed', 'archived');

CREATE TABLE campaigns (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               VARCHAR(255) NOT NULL,
  description        TEXT,
  status             campaign_status NOT NULL DEFAULT 'draft',
  start_date         DATE,
  end_date           DATE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_tenant_idx ON campaigns (tenant_id);

CREATE TABLE campaign_icp_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  icp_profile_id UUID NOT NULL REFERENCES icp_profiles(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, icp_profile_id)
);
CREATE INDEX campaign_icp_profiles_campaign_idx ON campaign_icp_profiles (campaign_id);
CREATE INDEX campaign_icp_profiles_icp_idx      ON campaign_icp_profiles (icp_profile_id);

ALTER TABLE events
  ADD COLUMN campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
CREATE INDEX events_campaign_idx ON events (campaign_id);
