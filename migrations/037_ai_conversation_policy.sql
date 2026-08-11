-- Migration 037: AI conversation policy state (Sprint D.1)
-- Adds explicit risk and automation controls so escalation does not implicitly disable AI.

ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS risk_state TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS automation_mode TEXT NOT NULL DEFAULT 'ai_active',
  ADD COLUMN IF NOT EXISTS needs_human_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

-- Normalize existing rows before enforcing constraints.
UPDATE ai_conversations
SET risk_state = 'normal'
WHERE risk_state IS NULL OR risk_state NOT IN ('normal', 'elevated', 'critical');

UPDATE ai_conversations
SET automation_mode = 'ai_active'
WHERE automation_mode IS NULL OR automation_mode NOT IN ('ai_active', 'ai_assist_only', 'human_only');

UPDATE ai_conversations
SET needs_human_review = false
WHERE needs_human_review IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_conversations_risk_state_check'
  ) THEN
    ALTER TABLE ai_conversations
      ADD CONSTRAINT ai_conversations_risk_state_check
      CHECK (risk_state IN ('normal', 'elevated', 'critical'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_conversations_automation_mode_check'
  ) THEN
    ALTER TABLE ai_conversations
      ADD CONSTRAINT ai_conversations_automation_mode_check
      CHECK (automation_mode IN ('ai_active', 'ai_assist_only', 'human_only'));
  END IF;
END $$;

COMMENT ON COLUMN ai_conversations.risk_state IS 'Thread risk state: normal | elevated | critical.';
COMMENT ON COLUMN ai_conversations.automation_mode IS 'AI automation policy: ai_active | ai_assist_only | human_only.';
COMMENT ON COLUMN ai_conversations.needs_human_review IS 'Signals landlord attention is required; does not automatically disable AI.';
COMMENT ON COLUMN ai_conversations.review_reason IS 'Optional reason for human review requirement.';

CREATE INDEX IF NOT EXISTS idx_ai_conv_policy_mode ON ai_conversations(automation_mode);
CREATE INDEX IF NOT EXISTS idx_ai_conv_policy_review ON ai_conversations(needs_human_review)
  WHERE needs_human_review = true;
