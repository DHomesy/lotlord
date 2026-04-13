-- Migration: 003_create_tenants_and_leases

CREATE TABLE IF NOT EXISTS tenants (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id),
  emergency_contact_name    TEXT,
  emergency_contact_phone   TEXT,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ  -- soft delete
);

CREATE INDEX idx_tenants_user ON tenants(user_id);

CREATE TABLE IF NOT EXISTS leases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         UUID NOT NULL REFERENCES units(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  monthly_rent    NUMERIC(10,2) NOT NULL,
  deposit_amount  NUMERIC(10,2),
  deposit_status  TEXT NOT NULL DEFAULT 'held'
                    CHECK (deposit_status IN ('held', 'returned', 'partial')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('active', 'expired', 'terminated', 'pending')),
  signed_at       TIMESTAMPTZ,
  document_url    TEXT,   -- Google Drive share link (→ S3 key when scaled)
  -- Late fee configuration — varies by state, set per lease
  late_fee_amount         NUMERIC(10,2) DEFAULT 0,
  late_fee_grace_days     INT          DEFAULT 5,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date > start_date)
);

CREATE INDEX idx_leases_unit    ON leases(unit_id);
CREATE INDEX idx_leases_tenant  ON leases(tenant_id);
CREATE INDEX idx_leases_status  ON leases(status);
CREATE INDEX idx_leases_end     ON leases(end_date);  -- used by lease expiry job
