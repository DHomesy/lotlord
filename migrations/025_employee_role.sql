-- Migration: 025_employee_role
-- Adds the 'employee' role and employer_id FK to users.
-- Employees are invite-only — they cannot self-register.
-- Run: npm run migrate:up

-- 1. Extend the role CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'landlord', 'tenant', 'employee'));

-- 2. Add employer_id column (NULL for all non-employee roles)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employer_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 3. Index for fast employee-by-employer lookups
CREATE INDEX IF NOT EXISTS idx_users_employer_id ON users(employer_id);
