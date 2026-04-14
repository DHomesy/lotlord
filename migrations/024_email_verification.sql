-- Migration: 024_email_verification
-- Adds email verification to the users table.
-- New landlords must click the emailed link before accessing the dashboard.
-- Tenants are not required to verify (they are invited, not self-served).
-- Admins are created via script with email pre-verified.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verify_token TEXT,
  ADD COLUMN IF NOT EXISTS email_verify_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email_verify_token ON users(email_verify_token)
  WHERE email_verify_token IS NOT NULL;

-- Pre-verify all existing users so they are not locked out after deploy
UPDATE users SET email_verified_at = NOW() WHERE email_verified_at IS NULL;
