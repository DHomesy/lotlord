-- Migration: 041_owner_qa_query_perf_and_search_indexes

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Accelerates owner AI session search by title and rolling summary text.
CREATE INDEX IF NOT EXISTS idx_owner_ai_sessions_title_trgm
  ON owner_ai_sessions USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_owner_ai_sessions_summary_trgm
  ON owner_ai_sessions USING GIN (rolling_summary gin_trgm_ops);

-- Supports owner QA payment rollups used in dues/overdue snapshots.
CREATE INDEX IF NOT EXISTS idx_rent_payments_charge_status
  ON rent_payments(charge_id, status);

-- Supports latest ledger-entry lookup per lease for balance snapshots.
CREATE INDEX IF NOT EXISTS idx_ledger_entries_lease_created_desc
  ON ledger_entries(lease_id, created_at DESC);
