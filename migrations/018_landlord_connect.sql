-- Migration 018: Stripe Connect accounts for landlords
-- Each landlord gets their own Stripe Express account so rent payments
-- are transferred directly to their bank (platform applies application_fee).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_account_id        TEXT,
  ADD COLUMN IF NOT EXISTS stripe_account_onboarded BOOLEAN NOT NULL DEFAULT FALSE;

-- Enforce uniqueness only on non-null values (partial index)
CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_account_id_idx
  ON users (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;
