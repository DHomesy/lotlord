-- Migration 024: Expand trigger_event CHECK constraint and seed default email templates
--
-- Adds trigger events used by the maintenance notification system and the
-- Stripe subscription billing lifecycle (payment failure, trial ending).
-- All INSERTs are guarded with NOT EXISTS so the migration is safe to re-run
-- in environments where templates were added manually.

-- ── 1. Expand the trigger_event CHECK constraint ──────────────────────────────
-- Drop the old constraint (Postgres assigns default name shown below) then
-- recreate with the full set of in-use values.

ALTER TABLE notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_trigger_event_check;

ALTER TABLE notification_templates
  ADD CONSTRAINT notification_templates_trigger_event_check
  CHECK (trigger_event IN (
    -- original events
    'rent_due', 'rent_overdue', 'late_fee_applied',
    'lease_expiring', 'maintenance_update',
    'payment_received',
    -- maintenance lifecycle (added in v1.5.x)
    'maintenance_submitted', 'maintenance_in_progress', 'maintenance_completed',
    -- SaaS billing lifecycle
    'subscription_payment_failed', 'subscription_trial_ending',
    -- catch-all
    'custom'
  ));

-- ── 2. Seed default email templates ──────────────────────────────────────────

-- maintenance_submitted → sent to landlord when a tenant submits a new request
INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Maintenance Request Submitted',
  'email',
  'maintenance_submitted',
  'New Maintenance Request — Unit {{unit}}',
  'A new maintenance request has been submitted for Unit {{unit}}.

Title: {{title}}
Category: {{category}}
Priority: {{priority}}

Log in to the portal to review the request and update its status.'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'maintenance_submitted' AND channel = 'email'
);

-- maintenance_in_progress → sent to tenant/submitter when landlord starts work
INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Maintenance In Progress',
  'email',
  'maintenance_in_progress',
  'Maintenance Update — Unit {{unit}}',
  'Hi,

Your maintenance request "{{title}}" at {{property}} (Unit {{unit}}) is now being worked on.

We will notify you once the work is complete.'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'maintenance_in_progress' AND channel = 'email'
);

-- maintenance_completed → sent to tenant/submitter when request is resolved
INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Maintenance Completed',
  'email',
  'maintenance_completed',
  'Maintenance Resolved — Unit {{unit}}',
  'Hi,

Your maintenance request "{{title}}" at {{property}} (Unit {{unit}}) has been resolved.

If the issue persists or recurs, please submit a new request through the portal.'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'maintenance_completed' AND channel = 'email'
);

-- subscription_payment_failed → sent to landlord when Stripe cannot charge them
INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Subscription Payment Failed',
  'email',
  'subscription_payment_failed',
  'Action Required — LotLord Payment Failed',
  'Hi {{first_name}},

We were unable to process your LotLord subscription payment. Your account access has been suspended.

Please update your payment method in your billing settings to restore full access.

If you believe this is an error, please contact support.'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'subscription_payment_failed' AND channel = 'email'
);

-- subscription_trial_ending → sent to landlord 3 days before trial expires
INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Subscription Trial Ending',
  'email',
  'subscription_trial_ending',
  'Your LotLord Trial Ends in 3 Days',
  'Hi {{first_name}},

Your LotLord free trial is ending in 3 days. After the trial period your subscription will automatically renew and you will be charged.

To manage your subscription or update your payment details, visit your billing settings in the portal.'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'subscription_trial_ending' AND channel = 'email'
);
