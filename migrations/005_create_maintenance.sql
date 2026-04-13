-- Migration: 005_create_maintenance

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         UUID NOT NULL REFERENCES units(id),
  submitted_by    UUID NOT NULL REFERENCES users(id),
  assigned_to     UUID REFERENCES users(id),  -- nullable until assigned
  category        TEXT NOT NULL
                    CHECK (category IN ('plumbing', 'electric', 'hvac', 'appliance', 'structural', 'other')),
  priority        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high', 'emergency')),
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_unit   ON maintenance_requests(unit_id);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);

CREATE TABLE IF NOT EXISTS maintenance_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES maintenance_requests(id),
  file_url        TEXT NOT NULL,  -- Google Drive link (→ S3 key when scaled)
  file_name       TEXT,
  file_type       TEXT,
  uploaded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maint_attach_request ON maintenance_attachments(request_id);
