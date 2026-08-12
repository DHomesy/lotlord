-- Migration 038: Persist maintenance triage slots on AI conversations

ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS maintenance_issue TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_onset_time TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_location TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_missing_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN ai_conversations.maintenance_issue IS 'Extracted maintenance issue summary for D.2 triage continuity.';
COMMENT ON COLUMN ai_conversations.maintenance_onset_time IS 'When the maintenance issue started, as provided by tenant.';
COMMENT ON COLUMN ai_conversations.maintenance_location IS 'Tenant-reported location of maintenance issue.';
COMMENT ON COLUMN ai_conversations.maintenance_missing_fields IS 'Required maintenance triage fields still missing (issue, onset_time, location).';

CREATE INDEX IF NOT EXISTS idx_ai_conv_maintenance_missing ON ai_conversations USING GIN (maintenance_missing_fields);
