-- Migration: 011_charges_created_by
-- Add created_by to rent_charges for audit trail.
-- Standalone charges (utilities, vacancy cleaning fees, etc.) need to record
-- which admin/staff member raised them — this is the missing audit link.

ALTER TABLE rent_charges
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Index so you can query "all charges created by staff member X"
CREATE INDEX IF NOT EXISTS idx_rent_charges_created_by ON rent_charges(created_by);
