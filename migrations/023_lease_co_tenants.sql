-- Migration 023: Co-tenants per lease
-- Allows multiple tenants on a single lease (e.g. roommates, spouses).
-- The primary tenant on leases.tenant_id is unchanged — this table holds
-- additional tenants who share the same lease and get full portal access.

-- Add lease_id to tenant_invitations so co-tenant invites can be linked
-- to a specific lease at invitation time.
ALTER TABLE tenant_invitations ADD COLUMN IF NOT EXISTS lease_id UUID REFERENCES leases(id);
CREATE INDEX IF NOT EXISTS idx_invitations_lease ON tenant_invitations(lease_id) WHERE lease_id IS NOT NULL;

-- Co-tenants pivot: one row per (lease, co-tenant) pair.
-- Max 3 co-tenants per lease (4 total including primary) is enforced at the service layer.
CREATE TABLE IF NOT EXISTS lease_co_tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id   UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lease_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_lease_co_tenants_lease  ON lease_co_tenants(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_co_tenants_tenant ON lease_co_tenants(tenant_id);
