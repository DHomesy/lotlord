-- Migration 036: Tenant reply received trigger + landlord templates
--
-- Adds trigger_event:
--   tenant_reply_received — notifies landlord that a tenant sent a new inbound message.
--
-- All inserts are idempotent.

-- 1) Expand trigger_event constraint
ALTER TABLE notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_trigger_event_check;

ALTER TABLE notification_templates
  ADD CONSTRAINT notification_templates_trigger_event_check
  CHECK (trigger_event IN (
    'rent_due', 'rent_overdue', 'late_fee_applied',
    'lease_expiring', 'maintenance_update',
    'payment_received',
    'maintenance_submitted', 'maintenance_in_progress', 'maintenance_completed',
    'subscription_payment_failed', 'subscription_trial_ending',
    'ai_sent_reply', 'conversation_escalated',
    'payment_initiated', 'payment_received_landlord', 'maintenance_cancelled',
    'tenant_reply_received',
    'custom'
  ));

-- 2) Email template
INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Tenant Reply Received - Email',
  'email',
  'tenant_reply_received',
  'New tenant reply from {{tenant_name}}',
  '<p><strong>{{tenant_name}}</strong> sent a new {{channel}} reply.</p>
<blockquote style="border-left:3px solid #ccc;margin:8px 0;padding:4px 12px;color:#555;">
  {{message_preview}}
</blockquote>
<p><a href="{{portal_url}}/messages?tab=ai">Open AI inbox →</a></p>'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'tenant_reply_received' AND channel = 'email'
);

-- 3) Optional SMS template (for landlords that use SMS alerts)
INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Tenant Reply Received - SMS',
  'sms',
  'tenant_reply_received',
  NULL,
  'LotLord: New {{channel}} reply from {{tenant_name}}. "{{message_preview}}"'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'tenant_reply_received' AND channel = 'sms'
);
