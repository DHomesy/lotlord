-- Migration: 017_charges_voided
-- Add soft-delete (void) support to rent_charges so admins/landlords can
-- cancel a charge without destroying the audit record.
-- A voided charge is excluded from balance calculations and displayed as 'voided'.

ALTER TABLE rent_charges
  ADD COLUMN IF NOT EXISTS voided_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by  UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_rent_charges_voided ON rent_charges(voided_at)
  WHERE voided_at IS NOT NULL;
