-- Migration: 039_owner_ai_sessions

CREATE TABLE IF NOT EXISTS owner_ai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Owner AI Session',
  rolling_summary TEXT,
  last_intent TEXT,
  message_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_ai_sessions_owner_updated
  ON owner_ai_sessions(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS owner_ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES owner_ai_sessions(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  intent TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  compact_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_ai_messages_session_created
  ON owner_ai_messages(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_ai_messages_owner_created
  ON owner_ai_messages(owner_id, created_at DESC);
