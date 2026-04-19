-- Migration 026: Add type to tenant_invitations
-- Distinguishes tenant invitations from employee invitations.
-- Existing rows default to 'tenant'.

ALTER TABLE tenant_invitations
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'tenant'
    CHECK (type IN ('tenant', 'employee'));
