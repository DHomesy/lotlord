-- Migration: 001_create_users
-- Run: npm run migrate:up
-- Rollback: npm run migrate:down

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- enables gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'tenant'
                    CHECK (role IN ('admin', 'tenant', 'staff')),
  first_name      TEXT,
  last_name       TEXT,
  phone           TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ  -- soft delete; always filter WHERE deleted_at IS NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);
