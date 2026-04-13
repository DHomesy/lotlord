-- Migration 012: allow 'received' status on notifications_log
-- Needed for logging inbound Twilio SMS messages (Step 15)
-- ─────────────────────────────────────────────────────────────────────────────

-- DROP the old CHECK so we can redefine it
ALTER TABLE notifications_log
  DROP CONSTRAINT IF EXISTS notifications_log_status_check;

-- Add the new CHECK that includes 'received'
ALTER TABLE notifications_log
  ADD CONSTRAINT notifications_log_status_check
  CHECK (status IN ('queued', 'sent', 'failed', 'bounced', 'received'));
