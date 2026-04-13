-- 023_ses_email_bounced.sql
-- Tracks SES bounce and complaint events at the user level.
-- When SES reports a permanent bounce or spam complaint, the webhook handler
-- sets email_bounced = true. notificationService blocks all outbound email
-- to bounced addresses to protect sender reputation.
--
-- To re-enable delivery after a user corrects their address:
--   UPDATE users SET email_bounced = false, email_bounced_at = NULL WHERE id = '<uuid>';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_bounced    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_bounced_at TIMESTAMPTZ;

-- Partial index: only indexes rows where email_bounced = true (very small, fast lookups)
CREATE INDEX IF NOT EXISTS idx_users_email_bounced
  ON users (email)
  WHERE email_bounced = true;
