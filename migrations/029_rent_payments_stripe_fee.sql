-- Migration 029: Add stripe_fee_cents to rent_payments
-- Records the ACH processing fee (0.8%, capped at $5) collected by the platform
-- on Stripe-initiated payments. NULL for manual (cash/check/zelle) payments.
ALTER TABLE rent_payments ADD COLUMN IF NOT EXISTS stripe_fee_cents INTEGER;
