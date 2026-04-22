-- Migration 027: Add 'zelle' as a valid payment_method on rent_payments
-- v1.7.2: manual payment recording UI exposes Zelle as a payment option

ALTER TABLE rent_payments
  DROP CONSTRAINT IF EXISTS rent_payments_payment_method_check;

ALTER TABLE rent_payments
  ADD CONSTRAINT rent_payments_payment_method_check
    CHECK (payment_method IN ('stripe_ach', 'stripe_card', 'check', 'cash', 'zelle', 'other'));
