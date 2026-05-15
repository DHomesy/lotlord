-- Migration 032: Unified Inbox + AI Conversation Schema (Sprint B)
-- ──────────────────────────────────────────────────────────────────────────────
-- Extends ai_conversations + ai_messages for the Unified Inbox and Owner
-- Supervisor view. Links notifications_log entries to conversations.
-- All changes are idempotent (IF NOT EXISTS / IF EXISTS guards throughout).

-- ── 1. ai_conversations: replace 'active' status with 'open' ─────────────────
-- The original migration (008) used 'active' as the default status value.
-- The inbox model uses 'open' for clarity. Rename in constraint + existing rows.

ALTER TABLE ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_status_check;

UPDATE ai_conversations SET status = 'open' WHERE status = 'active';

ALTER TABLE ai_conversations
  ALTER COLUMN status SET DEFAULT 'open';

ALTER TABLE ai_conversations
  ADD CONSTRAINT ai_conversations_status_check
  CHECK (status IN ('open', 'resolved', 'escalated'));

-- ── 2. ai_conversations: new metadata columns ─────────────────────────────────

ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS owner_id        UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unread_count    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS urgency         INT NOT NULL DEFAULT 3
    CHECK (urgency BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS category        TEXT
    CHECK (category IN ('maintenance', 'payment', 'lease', 'general'));

COMMENT ON COLUMN ai_conversations.owner_id        IS 'The landlord who owns this conversation. NULL = unrouted (platform-level, no landlord context).';
COMMENT ON COLUMN ai_conversations.last_message_at IS 'Timestamp of the most recent message in this thread. Updated on every insert to ai_messages.';
COMMENT ON COLUMN ai_conversations.unread_count    IS 'Number of inbound (tenant) messages not yet read by the landlord. Reset to 0 when landlord opens the thread.';
COMMENT ON COLUMN ai_conversations.urgency         IS '1 (low) to 5 (critical). Set by AI classification; can be overridden by admin.';
COMMENT ON COLUMN ai_conversations.category        IS 'AI-classified topic: maintenance | payment | lease | general.';

CREATE INDEX IF NOT EXISTS idx_ai_conv_owner    ON ai_conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_urgency  ON ai_conversations(urgency);

-- ── 3. notifications_log: link to conversation ────────────────────────────────
-- Every inbound SMS/email that belongs to a conversation gets tagged so the
-- inbox can correlate log entries with threads.

ALTER TABLE notifications_log
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES ai_conversations(id);

COMMENT ON COLUMN notifications_log.conversation_id IS 'Foreign key to the ai_conversation this notification belongs to. NULL for standalone sends (reminders, receipts, etc.).';

CREATE INDEX IF NOT EXISTS idx_notif_log_conv ON notifications_log(conversation_id);

-- ── 4. ai_messages: suggestion lifecycle + supervisor override audit ──────────
-- suggested      = true while the AI draft is pending; flipped to false when sent.
-- approved_by    = the user (landlord or admin) who triggered the send.
-- sent_at        = when the message was actually delivered; NULL = unsent draft.
-- supervisor_override = true when the platform owner injected this message.
-- override_by    = the admin user who performed the injection (audit trail).

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS suggested           BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by         UUID        REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS sent_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supervisor_override BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_by         UUID        REFERENCES users(id);

COMMENT ON COLUMN ai_messages.suggested           IS 'true = AI draft awaiting approval; false = already sent or landlord-composed message.';
COMMENT ON COLUMN ai_messages.approved_by         IS 'User who clicked Send (landlord in approval mode; null in auto-send mode).';
COMMENT ON COLUMN ai_messages.sent_at             IS 'Timestamp the message was delivered to the tenant. NULL = pending draft.';
COMMENT ON COLUMN ai_messages.supervisor_override IS 'true = this message was injected by the platform owner via the Supervisor page, not the landlord or AI.';
COMMENT ON COLUMN ai_messages.override_by         IS 'Admin user who performed the supervisor override. Audit trail for concierge-mode corrections.';

CREATE INDEX IF NOT EXISTS idx_ai_messages_suggested ON ai_messages(conversation_id, suggested)
  WHERE suggested = true;

-- idx_ai_messages_conv_time: speeds up last_message_preview correlated subquery in list queries
-- and the ORDER BY created_at in findMessages.
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv_time ON ai_messages(conversation_id, created_at);

-- idx_ai_messages_sent_at: speeds up the 24-hour window scan in countRecentAiReplies.
CREATE INDEX IF NOT EXISTS idx_ai_messages_sent_at ON ai_messages(sent_at)
  WHERE sent_at IS NOT NULL;
