-- Migration 028: Seed default email templates for cron-job notifications
--
-- The rent_due and late_fee_applied trigger events are fired by the daily
-- rentReminder and lateFee jobs. Without a matching template in the DB the
-- jobs silently skip every tenant — no emails are sent.
--
-- All INSERTs use NOT EXISTS guards so this migration is safe to re-run
-- in environments where templates were added manually.

-- ── rent_due ──────────────────────────────────────────────────────────────────
INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Rent Due Reminder',
  'email',
  'rent_due',
  'Rent Due Tomorrow — {{property}} Unit {{unit}}',
  '<p>Hi {{first_name}},</p>
<p>This is a friendly reminder that your rent of <strong>{{amount}}</strong> for
<strong>{{property}} — Unit {{unit}}</strong> is due tomorrow, <strong>{{due_date}}</strong>.</p>
<p>Please ensure payment is made on time to avoid a late fee.</p>
<p>If you have already submitted payment, please disregard this message.</p>
<p>Thank you,<br>The LotLord Team</p>'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'rent_due' AND channel = 'email'
);

-- ── late_fee_applied ──────────────────────────────────────────────────────────
INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Late Fee Applied',
  'email',
  'late_fee_applied',
  'Late Fee Applied — {{property}} Unit {{unit}}',
  '<p>Hi {{first_name}},</p>
<p>A late fee of <strong>{{amount}}</strong> has been applied to your account for
<strong>{{property}} — Unit {{unit}}</strong> because the rent due on
<strong>{{due_date}}</strong> has not been received.</p>
<p>Please log in to your tenant portal to view your balance and submit payment as
soon as possible.</p>
<p>If you believe this is an error, please contact your landlord directly.</p>
<p>Thank you,<br>The LotLord Team</p>'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'late_fee_applied' AND channel = 'email'
);
