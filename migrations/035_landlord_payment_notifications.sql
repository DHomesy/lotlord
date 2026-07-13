-- Migration 035: Landlord payment notifications + maintenance_cancelled template
--
-- Adds three new trigger events and seeds their templates:
--   payment_initiated         → landlord notified when tenant starts an ACH payment
--   payment_received_landlord → landlord notified when that payment completes
--   maintenance_cancelled     → tenant notified when their request is cancelled
--
-- Also improves existing maintenance notification templates to include
-- a portal link and property name (previously plain text with no CTA).

-- ── 1. Expand trigger_event constraint ───────────────────────────────────────

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
    -- new in migration 035
    'payment_initiated', 'payment_received_landlord', 'maintenance_cancelled',
    'custom'
  ));

-- ── 2. payment_initiated → landlord (tenant started a payment) ───────────────

INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Payment Initiated - Landlord',
  'email',
  'payment_initiated',
  'Payment started — {{tenant_name}}, {{property}} Unit {{unit}}',
  '<p>Hi,</p>
<p><strong>{{tenant_name}}</strong> has initiated an ACH bank transfer of <strong>{{amount}}</strong>
for <strong>{{property}} — Unit {{unit}}</strong>.</p>
<p>ACH transfers typically take 1–3 business days to settle. You will receive another email once the payment has completed.</p>
<p><a href="{{portal_url}}">View in your portal →</a></p>
<p>The LotLord Team</p>'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'payment_initiated' AND channel = 'email'
);

-- ── 3. payment_received_landlord → landlord (payment settled) ────────────────

INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Payment Received - Landlord',
  'email',
  'payment_received_landlord',
  'Payment received — {{tenant_name}}, {{property}} Unit {{unit}}',
  '<p>Hi,</p>
<p>A payment of <strong>{{amount}}</strong> from <strong>{{tenant_name}}</strong>
for <strong>{{property}} — Unit {{unit}}</strong> has been successfully processed on <strong>{{payment_date}}</strong>.</p>
<p>The funds will appear in your connected bank account within 1–2 business days.</p>
<p><a href="{{portal_url}}">View payment history →</a></p>
<p>The LotLord Team</p>'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'payment_received_landlord' AND channel = 'email'
);

-- ── 4. maintenance_cancelled → tenant (landlord cancelled the request) ────────

INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Maintenance Request Cancelled',
  'email',
  'maintenance_cancelled',
  'Maintenance request cancelled — {{property}} Unit {{unit}}',
  '<p>Hi,</p>
<p>Your maintenance request <strong>"{{title}}"</strong> for <strong>{{property}} — Unit {{unit}}</strong>
has been cancelled.</p>
<p>If this issue is still unresolved or you believe this was in error, please submit a new request through your portal.</p>
<p><a href="{{portal_url}}">Submit a new request →</a></p>
<p>The LotLord Team</p>'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'maintenance_cancelled' AND channel = 'email'
);

-- ── 5. Update maintenance_submitted to include property name + portal link ────
-- Unconditional UPDATE — improves the plain-text body from migration 024.

UPDATE notification_templates
SET
  subject       = 'New maintenance request — {{property}} Unit {{unit}}',
  body_template = '<p>Hi,</p>
<p>A new maintenance request has been submitted for <strong>{{property}} — Unit {{unit}}</strong>.</p>
<table style="border-collapse:collapse;margin:12px 0;">
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;">Title</td><td style="font-weight:600;">{{title}}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;">Category</td><td>{{category}}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;">Priority</td><td>{{priority}}</td></tr>
</table>
<p><a href="{{portal_url}}">Review and update the request →</a></p>
<p>The LotLord Team</p>'
WHERE trigger_event = 'maintenance_submitted' AND channel = 'email';

-- ── 6. Update maintenance_in_progress to include portal link ─────────────────

UPDATE notification_templates
SET
  body_template = '<p>Hi,</p>
<p>Your maintenance request <strong>"{{title}}"</strong> at <strong>{{property}} — Unit {{unit}}</strong>
is now <strong>in progress</strong>.</p>
<p>Your property manager is working on it. You will receive another update when it is resolved.</p>
<p><a href="{{portal_url}}">View your request →</a></p>
<p>The LotLord Team</p>'
WHERE trigger_event = 'maintenance_in_progress' AND channel = 'email';

-- ── 7. Update maintenance_completed to include portal link ───────────────────

UPDATE notification_templates
SET
  body_template = '<p>Hi,</p>
<p>Your maintenance request <strong>"{{title}}"</strong> at <strong>{{property}} — Unit {{unit}}</strong>
has been <strong>resolved</strong>.</p>
<p>If the issue persists or recurs, please submit a new request through your portal.</p>
<p><a href="{{portal_url}}">View your request →</a></p>
<p>The LotLord Team</p>'
WHERE trigger_event = 'maintenance_completed' AND channel = 'email';
