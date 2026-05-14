-- Migration 031: Per-landlord SMS provisioning + AI configuration columns
-- Applies to landlord rows only. All columns are nullable or have safe defaults
-- so existing data is unaffected.
-- Run: npm run migrate:up

-- SMS: populated by twilioService.provisionSmsNumber(); null = not yet provisioned
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS twilio_sms_number            TEXT,
  ADD COLUMN IF NOT EXISTS twilio_messaging_service_sid TEXT;

-- AI behaviour config (landlord only; defaults: AI on, approval required, notify via email)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ai_enabled         BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_reply_mode      TEXT     NOT NULL DEFAULT 'approval'
    CHECK (ai_reply_mode IN ('approval', 'auto')),
  ADD COLUMN IF NOT EXISTS ai_notify_on_send  BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_notify_channels TEXT[]   NOT NULL DEFAULT ARRAY['email'];

COMMENT ON COLUMN users.twilio_sms_number            IS 'E.164 number provisioned via Twilio for this landlord (e.g. +15125551234). NULL = not provisioned.';
COMMENT ON COLUMN users.twilio_messaging_service_sid IS 'Twilio Messaging Service SID that owns the landlord''s SMS number.';
COMMENT ON COLUMN users.ai_enabled                   IS 'Master switch: when false, AI agent does not process or reply to this landlord''s tenant messages.';
COMMENT ON COLUMN users.ai_reply_mode                IS '"approval" = AI drafts a suggestion, landlord must click Send. "auto" = AI sends immediately.';
COMMENT ON COLUMN users.ai_notify_on_send            IS 'When true, landlord is notified each time AI sends a message on their behalf.';
COMMENT ON COLUMN users.ai_notify_channels           IS 'Channels used for ai_notify_on_send alerts. Valid values: "email", "sms". Array allows both.';
