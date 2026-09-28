-- Migration 036: Add landlord and property context to tenant-facing emails.
-- Platform/account emails and landlord-facing operational alerts are unchanged.

UPDATE notification_templates
SET subject = CASE trigger_event
  WHEN 'rent_due' THEN
    '{{landlord_name}} via LotLord: Rent reminder - {{amount}} due {{due_date}}'
  WHEN 'late_fee_applied' THEN
    '{{landlord_name}} via LotLord: Late fee notice - {{property}} Unit {{unit}}'
  WHEN 'lease_expiring' THEN
    '{{landlord_name}} via LotLord: Lease ending {{lease_end}} - {{property}}'
  WHEN 'payment_received' THEN
    '{{landlord_name}} via LotLord: Payment received - {{property}} Unit {{unit}}'
  WHEN 'maintenance_in_progress' THEN
    '{{landlord_name}} via LotLord: Maintenance update - {{property}} Unit {{unit}}'
  WHEN 'maintenance_completed' THEN
    '{{landlord_name}} via LotLord: Maintenance resolved - {{property}} Unit {{unit}}'
  WHEN 'maintenance_cancelled' THEN
    '{{landlord_name}} via LotLord: Maintenance cancelled - {{property}} Unit {{unit}}'
  ELSE subject
END
WHERE channel = 'email'
  AND trigger_event IN (
    'rent_due',
    'late_fee_applied',
    'lease_expiring',
    'payment_received',
    'maintenance_in_progress',
    'maintenance_completed',
    'maintenance_cancelled'
  );

UPDATE notification_templates
SET body_template = $body$<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" style="max-width:560px;width:100%;" cellpadding="0" cellspacing="0">
<tr><td style="background:#1a2e4a;padding:24px 32px;border-radius:8px 8px 0 0;">
  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">LotLord</p>
  <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.2px;">Property Management</p>
</td></tr>
<tr><td style="background:#ffffff;padding:32px;">
  <h2 style="margin:0 0 8px;font-size:20px;color:#1f2937;">Late Fee Applied</h2>
  <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.65;">
    Hi {{first_name}}, a late fee was applied because the rent payment below was not received by its due date.
  </p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:28px;">
  <tr><td style="padding:20px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:13px;color:#6b7280;padding-bottom:8px;">Property</td><td align="right" style="font-size:13px;font-weight:600;padding-bottom:8px;">{{property}} - Unit {{unit}}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding-bottom:8px;">Original Rent</td><td align="right" style="font-size:13px;font-weight:600;padding-bottom:8px;">{{rent_amount}}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding-bottom:8px;">Original Due Date</td><td align="right" style="font-size:13px;font-weight:600;padding-bottom:8px;">{{original_due_date}}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding-bottom:8px;">Late Fee Applied</td><td align="right" style="font-size:13px;font-weight:600;padding-bottom:8px;">{{late_fee_date}}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;border-top:1px solid #fed7aa;padding-top:12px;">Late Fee</td><td align="right" style="font-size:19px;font-weight:700;color:#b45309;border-top:1px solid #fed7aa;padding-top:12px;">{{amount}}</td></tr>
    </table>
  </td></tr>
  </table>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr><td align="center" style="background:#2563eb;border-radius:6px;">
    <a href="{{portal_url}}/my/charges" style="display:inline-block;padding:13px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">View My Balance</a>
  </td></tr>
  </table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>$body$
WHERE trigger_event = 'late_fee_applied' AND channel = 'email';

UPDATE notification_templates
SET body_template = CASE
  WHEN body_template ILIKE '%</body>%' THEN
    regexp_replace(body_template, '</body>', $context$
<table data-lotlord-property-context="true" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:20px 32px;">
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;line-height:1.6;">
  <strong style="color:#334155;">{{property}}</strong><br>
  {{property_address}}<br><br>
  Regards,<br><strong style="color:#334155;">{{landlord_name}}</strong><br>
  Sent securely via LotLord
</td></tr>
</table>
</body>$context$, 'i')
  ELSE body_template || $context$

<div data-lotlord-property-context="true" style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;line-height:1.6;">
  <strong style="color:#334155;">{{property}}</strong><br>
  {{property_address}}<br><br>
  Regards,<br><strong style="color:#334155;">{{landlord_name}}</strong><br>
  Sent securely via LotLord
</div>$context$
END
WHERE channel = 'email'
  AND trigger_event IN (
    'rent_due',
    'late_fee_applied',
    'lease_expiring',
    'payment_received',
    'maintenance_in_progress',
    'maintenance_completed',
    'maintenance_cancelled'
  )
  AND body_template NOT LIKE '%data-lotlord-property-context%';