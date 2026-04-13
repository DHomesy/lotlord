/**
 * Integration test fixture bootstrap.
 *
 * Creates two complete landlord stacks (user → property → unit → tenant → lease)
 * plus one admin user. Generates JWTs for each actor.
 *
 * All test records use emails matching `test_%@test.invalid`. Cleanup deletes
 * in reverse FK-dependency order so no constraint violations occur.
 *
 * Usage:
 *   let fx;
 *   beforeAll(async () => { fx = await setup(); });
 *   afterAll(async () => { if (fx) await fx.teardown(); });
 *
 * Environment requirements:
 *   DATABASE_URL  — must point to a TEST database (not production/development)
 *   JWT_SECRET    — used to sign test tokens
 */

require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

/**
 * Deletes all test fixture data in reverse FK-dependency order.
 * Safe to call even when no test data exists.
 */
async function cleanTestFixtures(pool) {
  const byLandlord = `(SELECT id FROM users WHERE email LIKE 'test_%@test.invalid')`;
  const ownedProps = `(SELECT id FROM properties WHERE owner_id IN ${byLandlord})`;
  const ownedUnits = `(SELECT id FROM units WHERE property_id IN ${ownedProps})`;
  const ownedLeases = `(SELECT id FROM leases WHERE unit_id IN ${ownedUnits})`;

  await pool.query(`DELETE FROM rent_payments WHERE lease_id IN ${ownedLeases}`);
  await pool.query(`DELETE FROM ledger_entries WHERE lease_id IN ${ownedLeases}`);
  await pool.query(`DELETE FROM rent_charges WHERE unit_id IN ${ownedUnits}`);
  await pool.query(`DELETE FROM maintenance_requests WHERE unit_id IN ${ownedUnits}`);
  await pool.query(`DELETE FROM documents WHERE owner_id IN ${byLandlord}`);
  await pool.query(`DELETE FROM tenant_invitations WHERE invited_by IN ${byLandlord}`);
  await pool.query(`DELETE FROM leases WHERE unit_id IN ${ownedUnits}`);
  await pool.query(`DELETE FROM tenants WHERE user_id IN ${byLandlord}`);
  await pool.query(`DELETE FROM units WHERE property_id IN ${ownedProps}`);
  await pool.query(`DELETE FROM properties WHERE owner_id IN ${byLandlord}`);
  await pool.query(`DELETE FROM users WHERE email LIKE 'test_%@test.invalid'`);
}

/**
 * Creates all fixture data and returns the fixture object.
 */
async function setup() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });

  // Pre-cleanup: remove any leftover fixtures from a previous failed run
  await cleanTestFixtures(pool);

  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';

  function makeToken(id, role, email) {
    return jwt.sign({ sub: id, email, role }, JWT_SECRET, { expiresIn: '1h' });
  }

  const passwordHash = await bcrypt.hash('TestPassword1!', 10);

  // ── Users ──────────────────────────────────────────────────────────────────
  const adminId       = uuidv4();
  const landlordAId   = uuidv4();
  const landlordBId   = uuidv4();
  const tenantAUserId = uuidv4();
  const tenantBUserId = uuidv4();

  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, first_name, last_name, accepted_terms_at)
     VALUES
       ($1, 'test_admin@test.invalid',      $6, 'admin',    'Test', 'Admin',     NOW()),
       ($2, 'test_landlord_a@test.invalid',  $6, 'landlord', 'Test', 'LandlordA', NOW()),
       ($3, 'test_landlord_b@test.invalid',  $6, 'landlord', 'Test', 'LandlordB', NOW()),
       ($4, 'test_tenant_a@test.invalid',    $6, 'tenant',   'Test', 'TenantA',   NOW()),
       ($5, 'test_tenant_b@test.invalid',    $6, 'tenant',   'Test', 'TenantB',   NOW())`,
    [adminId, landlordAId, landlordBId, tenantAUserId, tenantBUserId, passwordHash],
  );

  // ── Properties ─────────────────────────────────────────────────────────────
  const propertyAId = uuidv4();
  const propertyBId = uuidv4();

  await pool.query(
    `INSERT INTO properties (id, owner_id, name, address_line1, city, state, zip)
     VALUES
       ($1, $3, 'Test Property A', '1 Test St', 'Testville', 'TX', '00001'),
       ($2, $4, 'Test Property B', '2 Test St', 'Testville', 'TX', '00002')`,
    [propertyAId, propertyBId, landlordAId, landlordBId],
  );

  // ── Units ──────────────────────────────────────────────────────────────────
  const unitAId = uuidv4();
  const unitBId = uuidv4();

  await pool.query(
    `INSERT INTO units (id, property_id, unit_number, rent_amount)
     VALUES
       ($1, $3, '1A', 1000),
       ($2, $4, '1B', 1200)`,
    [unitAId, unitBId, propertyAId, propertyBId],
  );

  // ── Tenant profiles ────────────────────────────────────────────────────────
  const tenantAProfileId = uuidv4();
  const tenantBProfileId = uuidv4();

  await pool.query(
    `INSERT INTO tenants (id, user_id) VALUES ($1, $2), ($3, $4)`,
    [tenantAProfileId, tenantAUserId, tenantBProfileId, tenantBUserId],
  );

  // ── Leases ─────────────────────────────────────────────────────────────────
  const leaseAId = uuidv4();
  const leaseBId = uuidv4();

  await pool.query(
    `INSERT INTO leases (id, unit_id, tenant_id, status, start_date, end_date, monthly_rent)
     VALUES
       ($1, $3, $5, 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', 1000),
       ($2, $4, $6, 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', 1200)`,
    [leaseAId, leaseBId, unitAId, unitBId, tenantAProfileId, tenantBProfileId],
  );

  // ── Invitations (for invitation tests) ─────────────────────────────────────
  const inviteAId    = uuidv4();
  const inviteBId    = uuidv4();
  const inviteTokenA = uuidv4();
  const inviteTokenB = uuidv4();

  await pool.query(
    `INSERT INTO tenant_invitations (id, token, invited_by, unit_id, email, first_name, last_name, expires_at)
     VALUES
       ($1, $2, $5, $7, 'test_invite_a@test.invalid', 'Invite', 'A', NOW() + INTERVAL '7 days'),
       ($3, $4, $6, $8, 'test_invite_b@test.invalid', 'Invite', 'B', NOW() + INTERVAL '7 days')`,
    [inviteAId, inviteTokenA, inviteBId, inviteTokenB, landlordAId, landlordBId, unitAId, unitBId],
  );

  // ── JWTs ───────────────────────────────────────────────────────────────────
  const adminToken   = makeToken(adminId,       'admin',    'test_admin@test.invalid');
  const tokenA       = makeToken(landlordAId,   'landlord', 'test_landlord_a@test.invalid');
  const tokenB       = makeToken(landlordBId,   'landlord', 'test_landlord_b@test.invalid');
  const tenantAToken = makeToken(tenantAUserId, 'tenant',   'test_tenant_a@test.invalid');
  const tenantBToken = makeToken(tenantBUserId, 'tenant',   'test_tenant_b@test.invalid');

  async function teardown() {
    await cleanTestFixtures(pool);
    await pool.end();
  }

  return {
    pool,
    teardown,
    admin:     { id: adminId,       token: adminToken },
    landlordA: { id: landlordAId,   token: tokenA },
    landlordB: { id: landlordBId,   token: tokenB },
    tenantA:   { id: tenantAUserId, token: tenantAToken, tenantProfileId: tenantAProfileId },
    tenantB:   { id: tenantBUserId, token: tenantBToken, tenantProfileId: tenantBProfileId },
    propertyA: { id: propertyAId },
    propertyB: { id: propertyBId },
    unitA:     { id: unitAId },
    unitB:     { id: unitBId },
    leaseA:    { id: leaseAId },
    leaseB:    { id: leaseBId },
    inviteA:   { id: inviteAId },
    inviteB:   { id: inviteBId },
  };
}

module.exports = { setup };

