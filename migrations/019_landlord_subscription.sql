-- 019_landlord_subscription.sql
-- Adds SaaS subscription state to the users table for landlord billing.
--
-- stripe_billing_customer_id  — Stripe Customer ID used for platform billing
--                               (distinct from the tenant-side ACH customer on the tenants table)
-- subscription_id             — Active Stripe Subscription ID
-- subscription_status         — Mirrors Stripe's subscription status:
--                               none | trialing | active | past_due | canceled | incomplete
-- subscription_plan           — Human-readable plan name or Stripe Price ID

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_billing_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_id            TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status        TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_plan          TEXT;
