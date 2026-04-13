-- Migration: 016_landlord_role
-- Replaces the 'staff' role with 'landlord' as a first-class role.
-- Run: npm run migrate:up

-- 1. Migrate any existing 'staff' users to 'landlord'
UPDATE users SET role = 'landlord' WHERE role = 'staff';

-- 2. Drop the old CHECK constraint and add the new one
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'landlord', 'tenant'));
