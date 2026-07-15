-- Migration 034: AWS SMS platform support (dedicated per-landlord numbers + consent + usage)

-- 1) users: AWS SMS provisioning fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS aws_sms_phone_number    TEXT,
  ADD COLUMN IF NOT EXISTS aws_sms_phone_number_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_aws_sms_phone_number
  ON users(aws_sms_phone_number)
  WHERE aws_sms_phone_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_aws_sms_phone_number_id
  ON users(aws_sms_phone_number_id)
  WHERE aws_sms_phone_number_id IS NOT NULL;

COMMENT ON COLUMN users.aws_sms_phone_number IS
  'AWS End User Messaging dedicated number in E.164 format for this landlord.';
COMMENT ON COLUMN users.aws_sms_phone_number_id IS
  'AWS End User Messaging phone number identity id for API operations.';

-- 2) notifications_log: track segment usage for cost controls
ALTER TABLE notifications_log
  ADD COLUMN IF NOT EXISTS sms_segments INT;

COMMENT ON COLUMN notifications_log.sms_segments IS
  'Estimated number of SMS segments for outbound message cost tracking.';

-- 3) Per-tenant, per-landlord SMS preference (shared behavior model)
CREATE TABLE IF NOT EXISTS tenant_sms_preferences (
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  sms_opt_in   BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_sms_pref_owner ON tenant_sms_preferences(owner_id);

-- 4) Consent/audit trail events
CREATE TABLE IF NOT EXISTS sms_consent_events (
  id           UUID PRIMARY KEY,
  tenant_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,
  owner_id     UUID REFERENCES users(id)   ON DELETE SET NULL,
  event_type   TEXT NOT NULL CHECK (event_type IN ('opt_in', 'opt_out', 'help', 'start')),
  source       TEXT NOT NULL DEFAULT 'sms_inbound',
  message_id   TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_consent_owner_created ON sms_consent_events(owner_id, created_at DESC);

-- 5) Monthly usage aggregation for plan guardrails
CREATE TABLE IF NOT EXISTS sms_usage_monthly (
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_month   DATE NOT NULL,
  segments_used INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, usage_month)
);

CREATE INDEX IF NOT EXISTS idx_sms_usage_month ON sms_usage_monthly(usage_month);
