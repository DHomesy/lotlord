-- Migration: 040_owner_qa_quality_metrics

CREATE TABLE IF NOT EXISTS owner_qa_quality_metrics (
  id BIGSERIAL PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intent TEXT NOT NULL,
  confidence TEXT NOT NULL,
  fallback_recommended BOOLEAN NOT NULL,
  bucket_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sample_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, intent, confidence, fallback_recommended, bucket_date)
);

CREATE INDEX IF NOT EXISTS idx_owner_qa_quality_owner_date
  ON owner_qa_quality_metrics(owner_id, bucket_date DESC);

CREATE INDEX IF NOT EXISTS idx_owner_qa_quality_intent_date
  ON owner_qa_quality_metrics(intent, bucket_date DESC);
