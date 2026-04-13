-- 022_users_accepted_terms.sql
-- Records when a user agreed to the Terms of Service and Privacy Policy.
-- NULL means the user registered before this feature was introduced.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ;
