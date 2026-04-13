-- Migration: 004_create_financial_ledger
-- IMPORTANT: ledger_entries is append-only. Never UPDATE or DELETE rows.

CREATE TABLE IF NOT EXISTS rent_charges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id        UUID NOT NULL REFERENCES leases(id),
  due_date        DATE NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  charge_type     TEXT NOT NULL
                    CHECK (charge_type IN ('rent', 'late_fee', 'utility', 'other')),
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rent_charges_lease    ON rent_charges(lease_id);
CREATE INDEX idx_rent_charges_due_date ON rent_charges(due_date);  -- used by reminder jobs

CREATE TABLE IF NOT EXISTS rent_payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id                  UUID NOT NULL REFERENCES leases(id),
  charge_id                 UUID REFERENCES rent_charges(id),  -- nullable: unlinked/partial payment
  amount_paid               NUMERIC(10,2) NOT NULL,
  payment_date              DATE NOT NULL,
  payment_method            TEXT NOT NULL
                              CHECK (payment_method IN ('stripe_ach', 'stripe_card', 'check', 'cash', 'other')),
  stripe_payment_intent_id  TEXT,        -- for Stripe reconciliation
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rent_payments_lease  ON rent_payments(lease_id);
CREATE INDEX idx_rent_payments_status ON rent_payments(status);

-- Append-only audit ledger — source of truth for all financial history
CREATE TABLE IF NOT EXISTS ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id        UUID NOT NULL REFERENCES leases(id),
  entry_type      TEXT NOT NULL
                    CHECK (entry_type IN ('charge', 'payment', 'credit', 'adjustment')),
  amount          NUMERIC(10,2) NOT NULL,  -- positive = charge, negative = payment/credit
  balance_after   NUMERIC(10,2) NOT NULL,  -- running balance after this entry
  description     TEXT,
  reference_id    UUID,   -- FK to rent_charges.id or rent_payments.id
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO updated_at, NO deleted_at — this table is intentionally immutable
);

CREATE INDEX idx_ledger_lease      ON ledger_entries(lease_id);
CREATE INDEX idx_ledger_created_at ON ledger_entries(created_at);
