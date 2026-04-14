-- Migration: 023_archive_properties_units
-- Adds soft-delete (deleted_at) to properties and units so landlords can
-- archive a property + all its units without destroying financial history
-- (leases, charges, payments, ledger entries all remain intact).

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_properties_deleted ON properties(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_units_deleted       ON units(deleted_at)       WHERE deleted_at IS NOT NULL;
