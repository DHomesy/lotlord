-- Migration 034: Fix payment_received email template
--
-- The existing payment_received template contained {{due_date}} which was never
-- passed by the webhook handler — it rendered literally in the tenant's inbox.
-- This migration:
--   1. Inserts the template if it doesn't exist (environments that never had it)
--   2. Updates it unconditionally to fix the variable and add a portal link

INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Payment Received',
  'email',
  'payment_received',
  'Payment received — {{property}} Unit {{unit}}',
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'payment_received' AND channel = 'email'
);

UPDATE notification_templates
SET
  name          = 'Payment Received',
  subject       = 'Payment received — {{property}} Unit {{unit}}',
  body_template = $body$<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" style="max-width:560px;width:100%;" cellpadding="0" cellspacing="0">

<!-- Header -->
<tr><td style="background:#1a2e4a;padding:24px 32px;border-radius:8px 8px 0 0;">
  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">LotLord</p>
  <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.2px;">Property Management</p>
</td></tr>

<!-- Body -->
<tr><td style="background:#ffffff;padding:32px 32px 28px;">
  <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1f2937;">Payment Received</h2>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.65;">
    Hi {{first_name}}, we have received your payment. Thank you!
  </p>

  <!-- Payment detail card -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;">
  <tr><td style="padding:20px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Property</td>
        <td align="right" style="font-size:13px;color:#1f2937;font-weight:600;padding-bottom:10px;">{{property}}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Unit</td>
        <td align="right" style="font-size:13px;color:#1f2937;font-weight:600;padding-bottom:10px;">{{unit}}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Amount</td>
        <td align="right" style="font-size:13px;color:#1f2937;font-weight:600;padding-bottom:10px;">{{amount}}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;">Date received</td>
        <td align="right" style="font-size:13px;color:#1f2937;font-weight:600;">{{payment_date}}</td>
      </tr>
    </table>
  </td></tr></table>

  <!-- CTA -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
  <tr><td align="center">
    <a href="{{portal_url}}"
      style="display:inline-block;background:#1a2e4a;color:#ffffff;font-size:15px;font-weight:600;
             text-decoration:none;padding:14px 32px;border-radius:6px;">
      View Payment History
    </a>
  </td></tr></table>
</td></tr>

<!-- Footer -->
<tr><td style="background:#f8fafc;padding:20px 32px;border-radius:0 0 8px 8px;border-top:1px solid #e2e8f0;">
  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
    You received this because you are a tenant at {{property}}.<br>
    Questions? Log in to your portal at <a href="{{portal_url}}" style="color:#6b7280;">{{portal_url}}</a>.
  </p>
</td></tr>

</table>
</td></tr></table>
</body>
</html>$body$
WHERE trigger_event = 'payment_received' AND channel = 'email';
