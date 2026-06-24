-- Release 13.6 — Identity, Access Management & User Adoption

ALTER TYPE user_status ADD VALUE 'invited';
ALTER TYPE user_status ADD VALUE 'suspended';
ALTER TYPE user_status ADD VALUE 'locked';

CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'cancelled');

ALTER TABLE users
  ADD COLUMN failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN last_login_at timestamptz,
  ADD COLUMN last_activity_at timestamptz,
  ADD COLUMN session_count integer NOT NULL DEFAULT 0,
  ADD COLUMN avatar_url text,
  ADD COLUMN all_events boolean NOT NULL DEFAULT true,
  ADD COLUMN onboarding_step integer NOT NULL DEFAULT 0,
  ADD COLUMN onboarding_completed_at timestamptz;

-- Existing users predate the onboarding wizard — mark them as already complete
-- so the "Resume onboarding" banner doesn't surface for established accounts.
UPDATE users SET onboarding_step = 5, onboarding_completed_at = now();

ALTER TABLE audit_logs
  ADD COLUMN ip_address varchar(64);

CREATE TABLE password_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ph_user_idx ON password_history (user_id);

CREATE TABLE user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  first_name varchar(100) NOT NULL,
  last_name varchar(100),
  role user_role NOT NULL DEFAULT 'booth_user',
  event_access jsonb,
  message text,
  invitation_token varchar(128) NOT NULL UNIQUE,
  status invitation_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ui_tenant_idx ON user_invitations (tenant_id);
CREATE INDEX ui_email_idx ON user_invitations (email);
CREATE INDEX ui_status_idx ON user_invitations (tenant_id, status);

CREATE TABLE user_event_access (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);
CREATE INDEX uea_user_idx ON user_event_access (user_id);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token varchar(128) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prt_user_idx ON password_reset_tokens (user_id);
