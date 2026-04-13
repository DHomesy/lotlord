-- Migration: 002_create_properties_and_units

CREATE TABLE IF NOT EXISTS properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id),
  name            TEXT NOT NULL,
  address_line1   TEXT NOT NULL,
  address_line2   TEXT,
  city            TEXT NOT NULL,
  state           TEXT NOT NULL,
  zip             TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'US',
  property_type   TEXT CHECK (property_type IN ('single', 'multi', 'commercial')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_properties_owner ON properties(owner_id);

CREATE TABLE IF NOT EXISTS units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id),
  unit_number     TEXT NOT NULL,
  floor           INT,
  bedrooms        INT,
  bathrooms       NUMERIC(3,1),
  sq_ft           INT,
  rent_amount     NUMERIC(10,2) NOT NULL,
  deposit_amount  NUMERIC(10,2),
  status          TEXT NOT NULL DEFAULT 'vacant'
                    CHECK (status IN ('vacant', 'occupied', 'maintenance')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, unit_number)
);

CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_status   ON units(status);
