-- Migration 015: Notification opt-in preferences on tenants
-- -------------------------------------------------------------------------------------
-- Adds explicit opt-in flags to the tenants table so the system can gate all
-- outbound communications (email and SMS) on the tenant's consent.
--
-- Opt-in is captured at the moment the tenant accepts their invitation.
-- The AcceptInvitePage presents two checkboxes (one per channel that was
-- used on the invite).  Both default to FALSE — no sends happen without
-- explicit consent.
--
-- Existing tenants (created before this migration) are defaulted to TRUE
-- for backwards-compatibility; they joined the system under the implicit
-- assumption that communications would flow.  Any future self-signup goes
-- through the invite flow where they explicitly choose.
-- -------------------------------------------------------------------------------------

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in   BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing rows — treat pre-migration tenants as having opted in
UPDATE tenants SET email_opt_in = true, sms_opt_in = true WHERE email_opt_in = false;

COMMENT ON COLUMN tenants.email_opt_in IS
  'Tenant explicitly consented to receive email notifications at account creation.';
COMMENT ON COLUMN tenants.sms_opt_in IS
  'Tenant explicitly consented to receive SMS notifications at account creation.';
