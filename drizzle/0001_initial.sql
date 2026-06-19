-- Release 2: Tenant & User Management schema
-- Run once against your PostgreSQL database.

CREATE TYPE tenant_status AS ENUM ('active', 'inactive');
CREATE TYPE user_role    AS ENUM ('platform_admin', 'tenant_admin', 'manager', 'booth_user');
CREATE TYPE user_status  AS ENUM ('active', 'inactive');

CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255)  NOT NULL,
  slug        VARCHAR(100)  NOT NULL UNIQUE,
  subdomain   VARCHAR(100)  NOT NULL UNIQUE,
  event_name  VARCHAR(255),
  status      tenant_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          user_role    NOT NULL DEFAULT 'booth_user',
  status        user_status  NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX users_tenant_idx ON users(tenant_id);

CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES users(id)   ON DELETE SET NULL,
  action        VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id   VARCHAR(255),
  metadata      JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_tenant_idx  ON audit_logs(tenant_id);
CREATE INDEX audit_created_idx ON audit_logs(created_at);
