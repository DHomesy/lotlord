-- Migration: 009_add_stripe_customer
-- Adds stripe_customer_id to tenants so we can associate each tenant with
-- their Stripe Customer object. Required for reusing saved ACH payment methods
-- across multiple PaymentIntents without re-collecting bank details each time.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_customer
  ON tenants(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
