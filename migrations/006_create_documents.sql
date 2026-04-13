-- Migration: 006_create_documents

CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id),
  -- Polymorphic reference: points to a lease, unit, maintenance_request, or tenant row
  related_id      UUID,
  related_type    TEXT CHECK (related_type IN ('lease', 'unit', 'maintenance_request', 'tenant')),
  file_url        TEXT NOT NULL,   -- Google Drive share link (→ S3 key when scaled)
  file_name       TEXT,
  file_type       TEXT,
  category        TEXT CHECK (category IN ('lease', 'id', 'insurance', 'inspection', 'receipt', 'other')),
  uploaded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_owner        ON documents(owner_id);
CREATE INDEX idx_documents_related      ON documents(related_id, related_type);
