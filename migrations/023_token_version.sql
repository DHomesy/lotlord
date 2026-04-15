-- Migration 023: Add token_version to users for refresh token revocation.
-- Incrementing this column on logout invalidates all outstanding refresh tokens
-- issued before the increment, preventing replay of captured or leaked cookies.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
