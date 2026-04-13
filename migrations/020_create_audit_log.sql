-- Migration 020: Audit / Event Log
-- Append-only table that records every significant action in the system.
-- user_id is nullable for background/system events (cron jobs, webhooks).

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,          -- e.g. 'payment_created', 'lease_terminated'
  resource_type TEXT        NOT NULL,          -- 'payment', 'lease', 'charge', 'maintenance', etc.
  resource_id   UUID,                          -- ID of the affected record (nullable for bulk ops)
  metadata      JSONB,                         -- arbitrary context: old/new values, IP, amounts, etc.
  ip_address    TEXT,                          -- stored as text for flexibility (IPv4 + IPv6)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by actor (admin viewing "what did user X do?")
CREATE INDEX IF NOT EXISTS idx_audit_log_user       ON audit_log(user_id, created_at DESC);
-- Fast lookup by affected resource (admin viewing "what happened to lease Y?")
CREATE INDEX IF NOT EXISTS idx_audit_log_resource   ON audit_log(resource_type, resource_id, created_at DESC);
-- General time-ordered scan
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
