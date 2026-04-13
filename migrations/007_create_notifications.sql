-- Migration: 007_create_notifications

CREATE TABLE IF NOT EXISTS notification_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  trigger_event   TEXT NOT NULL
                    CHECK (trigger_event IN (
                      'rent_due', 'rent_overdue', 'late_fee_applied',
                      'lease_expiring', 'maintenance_update',
                      'payment_received', 'custom'
                    )),
  subject         TEXT,     -- email only
  -- Template variables: {{tenant_name}}, {{due_date}}, {{amount}}, {{unit}}, {{property}}
  body_template   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID REFERENCES notification_templates(id),  -- nullable for ad-hoc sends
  recipient_id    UUID NOT NULL REFERENCES users(id),
  channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'sent', 'failed', 'bounced')),
  subject         TEXT,
  body            TEXT,   -- rendered body (variables already substituted)
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_log_recipient ON notifications_log(recipient_id);
CREATE INDEX idx_notif_log_status    ON notifications_log(status);
