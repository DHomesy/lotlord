-- Migration 013: Email threading columns on notifications_log
-- Required for Gmail Push inbound processing (Step 16 prerequisite).
--
--  external_id  TEXT UNIQUE  — Gmail messageId.  Prevents reprocessing the same
--                              message if the Pub/Sub notification is retried.
--  thread_id    TEXT          — Gmail threadId.  Lets the AI agent (Step 18) call
--                              replyToEmail() inside the right conversation thread.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE notifications_log
  ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS thread_id   TEXT;

COMMENT ON COLUMN notifications_log.external_id IS
  'Provider-specific message ID (e.g. Gmail messageId). Used to deduplicate retried webhook deliveries.';

COMMENT ON COLUMN notifications_log.thread_id IS
  'Provider-specific conversation/thread ID (e.g. Gmail threadId). Used by the AI agent to reply in-thread.';
