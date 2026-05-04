-- Migration 030: Polish rent_due and late_fee_applied email templates
--
-- Replaces the plain-text bodies seeded in migration 028 with:
--   • Branded LotLord HTML layout (single-column, email-safe table structure)
--   • Charge detail card — property, unit, amount, due date at a glance
--   • Prominent CTA button linking to the tenant portal ({{portal_url}} is
--     automatically injected by notificationService.sendByTriggerEvent)
--   • Clean plain-text fallback is auto-generated from the HTML by ses.js
--   • Better subject lines with enough context to be useful in the inbox preview
--
-- Uses unconditional UPDATE — if an admin has customised these templates via
-- the UI they will be overwritten. They can re-customise them afterwards.

-- ── rent_due ──────────────────────────────────────────────────────────────────
UPDATE notification_templates
SET
  subject      = 'Rent reminder: {{amount}} due {{due_date}} — {{property}} Unit {{unit}}',
  body_template = $body$<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" style="max-width:560px;width:100%;" cellpadding="0" cellspacing="0">

<!-- ── Header ── -->
<tr><td style="background:#1a2e4a;padding:24px 32px;border-radius:8px 8px 0 0;">
  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">LotLord</p>
  <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.2px;">Property Management</p>
</td></tr>

<!-- ── Body ── -->
<tr><td style="background:#ffffff;padding:32px 32px 28px;">
  <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1f2937;">Rent Due Tomorrow</h2>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.65;">
    Hi {{first_name}}, your rent payment is due tomorrow.
    Please log in to your tenant portal to submit payment on time and avoid a late fee.
  </p>

  <!-- Charge detail card -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;">
  <tr><td style="padding:20px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Property</td>
        <td align="right" style="font-size:13px;color:#1f2937;font-weight:600;padding-bottom:10px;">{{property}}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;padding-bottom:12px;">Unit</td>
        <td align="right" style="font-size:13px;color:#1f2937;font-weight:600;padding-bottom:12px;">{{unit}}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;border-top:1px solid #e2e8f0;padding-top:12px;">Amount Due</td>
        <td align="right" style="font-size:19px;font-weight:700;color:#1f2937;border-top:1px solid #e2e8f0;padding-top:12px;">{{amount}}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;padding-top:6px;">Due Date</td>
        <td align="right" style="font-size:13px;font-weight:600;color:#dc2626;padding-top:6px;">{{due_date}}</td>
      </tr>
    </table>
  </td></tr>
  </table>

  <!-- CTA button -->
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr><td align="center" style="background:#2563eb;border-radius:6px;">
    <a href="{{portal_url}}/my/charges"
      style="display:inline-block;padding:13px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
      Pay My Rent
    </a>
  </td></tr>
  </table>
</td></tr>

<!-- ── Footer ── -->
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;border-radius:0 0 8px 8px;">
  <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.7;">
    You are receiving this automated reminder because you have an active lease at
    <strong style="color:#64748b;">{{property}}</strong>.
    If you have already submitted payment, please disregard this message.
    Reply to this email to reach your property manager.
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>$body$
WHERE trigger_event = 'rent_due' AND channel = 'email';

-- ── late_fee_applied ──────────────────────────────────────────────────────────
UPDATE notification_templates
SET
  subject      = 'Late fee applied: {{amount}} — {{property}} Unit {{unit}}',
  body_template = $body$<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" style="max-width:560px;width:100%;" cellpadding="0" cellspacing="0">

<!-- ── Header ── -->
<tr><td style="background:#1a2e4a;padding:24px 32px;border-radius:8px 8px 0 0;">
  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">LotLord</p>
  <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.2px;">Property Management</p>
</td></tr>

<!-- ── Body ── -->
<tr><td style="background:#ffffff;padding:32px 32px 28px;">
  <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1f2937;">Late Fee Applied to Your Account</h2>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.65;">
    Hi {{first_name}}, a late fee has been applied to your account because your rent was not
    received by the due date. Please log in to your portal to view your balance and submit
    payment as soon as possible.
  </p>

  <!-- Charge detail card -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:28px;">
  <tr><td style="padding:20px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:13px;color:#6b7280;padding-bottom:10px;">Property</td>
        <td align="right" style="font-size:13px;color:#1f2937;font-weight:600;padding-bottom:10px;">{{property}}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;padding-bottom:12px;">Unit</td>
        <td align="right" style="font-size:13px;color:#1f2937;font-weight:600;padding-bottom:12px;">{{unit}}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;border-top:1px solid #fed7aa;padding-top:12px;">Original Due Date</td>
        <td align="right" style="font-size:13px;font-weight:600;color:#9a3412;border-top:1px solid #fed7aa;padding-top:12px;">{{due_date}}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;padding-top:8px;">Late Fee</td>
        <td align="right" style="font-size:19px;font-weight:700;color:#b45309;padding-top:8px;">{{amount}}</td>
      </tr>
    </table>
  </td></tr>
  </table>

  <!-- CTA button -->
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr><td align="center" style="background:#2563eb;border-radius:6px;">
    <a href="{{portal_url}}/my/charges"
      style="display:inline-block;padding:13px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
      View My Balance
    </a>
  </td></tr>
  </table>
</td></tr>

<!-- ── Footer ── -->
<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;border-radius:0 0 8px 8px;">
  <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.7;">
    You are receiving this automated notice because you have an active lease at
    <strong style="color:#64748b;">{{property}}</strong>.
    If you believe this late fee was applied in error, please reply to this email to
    contact your property manager.
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>$body$
WHERE trigger_event = 'late_fee_applied' AND channel = 'email';
