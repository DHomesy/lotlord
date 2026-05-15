-- Migration 033: AI sent reply notification templates + expand trigger_event constraint
--
-- Adds two new trigger events:
--   ai_sent_reply          — notifies landlord when AI sends a message on their behalf
--   conversation_escalated — notifies landlord when a conversation is escalated (already
--                            used in conversationService but missing from the constraint)
--
-- All INSERTs are guarded with NOT EXISTS so this migration is safe to re-run.

-- ── 1. Expand the trigger_event CHECK constraint ──────────────────────────────

ALTER TABLE notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_trigger_event_check;

ALTER TABLE notification_templates
  ADD CONSTRAINT notification_templates_trigger_event_check
  CHECK (trigger_event IN (
    -- original events
    'rent_due', 'rent_overdue', 'late_fee_applied',
    'lease_expiring', 'maintenance_update',
    'payment_received',
    -- maintenance lifecycle
    'maintenance_submitted', 'maintenance_in_progress', 'maintenance_completed',
    -- SaaS billing lifecycle
    'subscription_payment_failed', 'subscription_trial_ending',
    -- AI inbox (added Sprint B)
    'ai_sent_reply', 'conversation_escalated',
    -- catch-all
    'custom'
  ));

-- ── 2. Seed ai_sent_reply — email ─────────────────────────────────────────────

INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'AI Sent Reply - Email',
  'email',
  'ai_sent_reply',
  'AI sent a reply to {{tenant_name}}',
  '<p>Your AI assistant sent the following message to <strong>{{tenant_name}}</strong>:</p>
<blockquote style="border-left:3px solid #ccc;margin:8px 0;padding:4px 12px;color:#555;">
  {{message_preview}}
</blockquote>
<p><a href="{{portal_url}}/inbox/{{conversation_id}}">View conversation →</a></p>'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'ai_sent_reply' AND channel = 'email'
);

-- ── 3. Seed ai_sent_reply — sms ───────────────────────────────────────────────

INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'AI Sent Reply - SMS',
  'sms',
  'ai_sent_reply',
  NULL,
  'LotLord AI replied to {{tenant_name}}: "{{message_preview}}"'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'ai_sent_reply' AND channel = 'sms'
);

-- ── 4. Seed conversation_escalated — email ────────────────────────────────────

INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Conversation Escalated - Email',
  'email',
  'conversation_escalated',
  'Action required: conversation with a tenant has been escalated',
  '<p>A conversation has been escalated and requires your direct attention.</p>
<p><a href="{{portal_url}}/inbox/{{conversation_id}}">View conversation →</a></p>'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'conversation_escalated' AND channel = 'email'
);

-- ── 5. Seed conversation_escalated — sms ──────────────────────────────────────

INSERT INTO notification_templates (name, channel, trigger_event, subject, body_template)
SELECT
  'Conversation Escalated - SMS',
  'sms',
  'conversation_escalated',
  NULL,
  'LotLord: A tenant conversation has been escalated and needs your attention.'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE trigger_event = 'conversation_escalated' AND channel = 'sms'
);

-- ── 6. Composite index for the main inbox query ───────────────────────────────
-- Covers the common filter: owner_id + status (used by findAllByOwner).

CREATE INDEX IF NOT EXISTS idx_ai_conv_owner_status
  ON ai_conversations (owner_id, status);
