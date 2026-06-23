-- Release 13: Agent Orchestrator & Workflow Engine

CREATE TYPE agent_status AS ENUM ('active', 'inactive', 'maintenance');

CREATE TYPE agent_execution_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled', 'skipped');

CREATE TYPE workflow_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE agent_registry (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name                  VARCHAR(100) NOT NULL UNIQUE,
  agent_type                  VARCHAR(100) NOT NULL,
  description                 TEXT,
  version                     VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  status                      agent_status NOT NULL DEFAULT 'active',
  supports_retry              BOOLEAN NOT NULL DEFAULT TRUE,
  max_retries                 INTEGER NOT NULL DEFAULT 3,
  execution_timeout_seconds   INTEGER NOT NULL DEFAULT 60,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
  workflow_name   VARCHAR(100) NOT NULL DEFAULT 'lead_qualification',
  status          workflow_status NOT NULL DEFAULT 'queued',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  current_step    INTEGER NOT NULL DEFAULT 0,
  total_steps     INTEGER NOT NULL DEFAULT 6,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX wr_tenant_idx  ON workflow_runs (tenant_id);
CREATE INDEX wr_lead_idx    ON workflow_runs (lead_id);
CREATE INDEX wr_status_idx  ON workflow_runs (tenant_id, status);
CREATE INDEX wr_created_idx ON workflow_runs (tenant_id, created_at DESC);

CREATE TABLE agent_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
  workflow_id     UUID REFERENCES workflow_runs(id) ON DELETE CASCADE,
  agent_name      VARCHAR(100) NOT NULL,
  step_order      INTEGER NOT NULL DEFAULT 0,
  status          agent_execution_status NOT NULL DEFAULT 'queued',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  input_payload   JSONB,
  output_payload  JSONB,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ae_tenant_idx    ON agent_executions (tenant_id);
CREATE INDEX ae_lead_idx      ON agent_executions (lead_id);
CREATE INDEX ae_workflow_idx  ON agent_executions (workflow_id);
CREATE INDEX ae_agent_idx     ON agent_executions (tenant_id, agent_name);
CREATE INDEX ae_status_idx    ON agent_executions (tenant_id, status);
CREATE INDEX ae_created_idx   ON agent_executions (tenant_id, created_at DESC);

CREATE TABLE agent_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      VARCHAR(100) NOT NULL,
  policy_name     VARCHAR(150) NOT NULL,
  policy_type     VARCHAR(50) NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  configuration   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ap_agent_idx ON agent_policies (agent_name);

-- ── Seed: Agent Registry ────────────────────────────────────────────────────
INSERT INTO agent_registry (agent_name, agent_type, description, supports_retry, max_retries, execution_timeout_seconds) VALUES
  ('conversation_agent', 'conversation_intelligence', 'Extracts pain points, urgency, and next actions from lead notes/transcripts via Gemini.', TRUE, 3, 45),
  ('enrichment_agent',   'company_enrichment',        'Enriches company and contact data via Apollo.io.', TRUE, 3, 30),
  ('lead_scoring_agent', 'lead_scoring',              'Deterministic lead scoring with AI-generated explanation.', TRUE, 3, 30),
  ('followup_agent',     'followup_intelligence',     'Drafts follow-up email/LinkedIn/call scripts based on score and conversation data.', TRUE, 3, 45),
  ('crm_sync_agent',     'crm_recommendation',        'Prepares a HubSpot sync payload for human approval — never syncs automatically.', TRUE, 3, 30),
  ('roi_agent',          'roi_attribution',           'Recalculates event-level ROI metrics deterministically.', TRUE, 3, 30);

-- ── Seed: Agent Policies (examples from the spec) ───────────────────────────
INSERT INTO agent_policies (agent_name, policy_name, policy_type, enabled, configuration) VALUES
  ('crm_sync_agent', 'Minimum score for CRM recommendation', 'threshold_block', TRUE, '{"field": "score", "operator": "lt", "value": 60, "action": "skip_step"}'),
  ('lead_scoring_agent', 'Low confidence requires human review', 'review_required', TRUE, '{"field": "confidence_score", "operator": "lt", "value": 70, "action": "flag_needs_review"}'),
  ('crm_sync_agent', 'No automatic CRM sync', 'manual_approval_required', TRUE, '{"action": "block_auto_execution", "note": "CRM sync always requires explicit human approval — this agent only ever prepares a payload."}');
