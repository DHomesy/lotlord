-- Migration 034: Unmatched inbound message queue (admin review)
-- Stores inbound messages that cannot be mapped to a known user/tenant.

CREATE TABLE IF NOT EXISTS unmatched_inbound_messages (
  id UUID PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  external_id TEXT,
  from_address TEXT NOT NULL,
  to_address TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  raw_payload JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unmatched_inbound_channel_external
  ON unmatched_inbound_messages (channel, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unmatched_inbound_status_created
  ON unmatched_inbound_messages (status, created_at DESC);

CREATE OR REPLACE FUNCTION set_unmatched_inbound_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unmatched_inbound_updated_at ON unmatched_inbound_messages;
CREATE TRIGGER trg_unmatched_inbound_updated_at
BEFORE UPDATE ON unmatched_inbound_messages
FOR EACH ROW
EXECUTE FUNCTION set_unmatched_inbound_updated_at();