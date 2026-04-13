-- Migration: 010_unit_centric_charges
-- Make rent_charges unit-centric so landlords can query/create charges by unit
-- or tenant, not just by lease.
--
-- Before: rent_charges.lease_id NOT NULL  (every charge must belong to a lease)
-- After:  rent_charges.unit_id  NOT NULL  (every charge belongs to a unit)
--         rent_charges.lease_id NULLABLE  (present for rent/late-fee charges; null for utility/misc)
--         rent_charges.tenant_id NULLABLE (present when billing a specific person)
--         rent_charges.property_id NULLABLE (for property-wide charges)
--
-- Existing rows: lease_id stays set; unit_id/tenant_id backfilled from the lease.

-- Step 1: Add new columns (nullable so existing rows don't break immediately)
ALTER TABLE rent_charges
  ADD COLUMN IF NOT EXISTS unit_id     UUID REFERENCES units(id),
  ADD COLUMN IF NOT EXISTS tenant_id   UUID REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id);

-- Step 2: Backfill unit_id and tenant_id from the associated lease
UPDATE rent_charges rc
SET    unit_id   = l.unit_id,
       tenant_id = l.tenant_id
FROM   leases l
WHERE  l.id = rc.lease_id
  AND  rc.unit_id IS NULL;

-- Step 3: Enforce NOT NULL on unit_id now that all rows are backfilled
ALTER TABLE rent_charges
  ALTER COLUMN unit_id SET NOT NULL;

-- Step 4: Make lease_id nullable (charges can now exist without a lease)
ALTER TABLE rent_charges
  ALTER COLUMN lease_id DROP NOT NULL;

-- Step 5: Add indexes for the new lookup patterns
CREATE INDEX IF NOT EXISTS idx_rent_charges_unit     ON rent_charges(unit_id);
CREATE INDEX IF NOT EXISTS idx_rent_charges_tenant   ON rent_charges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_charges_property ON rent_charges(property_id);
