-- Migration: 008_create_ai_agent

CREATE TABLE IF NOT EXISTS ai_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  channel     TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  thread_id   TEXT,   -- external ref e.g. Twilio Conversation SID
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'resolved', 'escalated')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conv_tenant ON ai_conversations(tenant_id);
CREATE INDEX idx_ai_conv_status ON ai_conversations(status);

CREATE TABLE IF NOT EXISTS ai_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES ai_conversations(id),
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  tokens_used       INT,
  model_used        TEXT,   -- e.g. 'gpt-4o-mini'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Intentionally no updated_at — messages are immutable for audit purposes
);

CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id);
