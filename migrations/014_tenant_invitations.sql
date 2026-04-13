-- Migration 014: Tenant invitation system
-- Stores pending invitations sent by landlords/admins.
-- No user or tenant record is created until the tenant actually accepts.

CREATE TABLE tenant_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT UNIQUE NOT NULL,             -- URL-safe random token used in the signup link
  invited_by    UUID NOT NULL REFERENCES users(id),
  first_name    TEXT,                             -- pre-fills the signup form
  last_name     TEXT,
  email         TEXT,                             -- delivery address for email invite
  phone         TEXT,                             -- delivery address for SMS invite
  unit_id       UUID REFERENCES units(id),        -- optional: auto-scopes tenant after signup
  expires_at    TIMESTAMPTZ NOT NULL,             -- token expires 7 days after creation
  accepted_at   TIMESTAMPTZ,                      -- NULL = pending, set when tenant completes signup
  tenant_id     UUID REFERENCES tenants(id),      -- backfilled once the tenant record is created
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invitations_token      ON tenant_invitations(token);
CREATE INDEX idx_invitations_invited_by ON tenant_invitations(invited_by);
CREATE INDEX idx_invitations_pending    ON tenant_invitations(accepted_at) WHERE accepted_at IS NULL;
