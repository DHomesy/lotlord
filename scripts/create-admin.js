/**
 * Admin account bootstrap script.
 * ----------------------------------
 * Creates a single superadmin account if one doesn't already exist.
 * Safe to run multiple times — idempotent.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=yourpassword node scripts/create-admin.js
 *
 * Or with .env loaded:
 *   node scripts/create-admin.js
 *
 * Required env vars (or set ADMIN_EMAIL / ADMIN_PASSWORD directly):
 *   DATABASE_URL     — Postgres connection string
 *   ADMIN_EMAIL      — Email for the admin account
 *   ADMIN_PASSWORD   — Password for the admin account (min 8 chars)
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@lotlord.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!DATABASE_URL) {
  console.error('[create-admin] ERROR: DATABASE_URL is required');
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error('[create-admin] ERROR: ADMIN_PASSWORD must be set');
  console.error('  Usage: ADMIN_PASSWORD=secret node scripts/create-admin.js');
  console.error('  ADMIN_EMAIL defaults to admin@lotlord.app if not set');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 8) {
  console.error('[create-admin] ERROR: ADMIN_PASSWORD must be at least 8 characters');
  process.exit(1);
}

async function run() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    // Check if this email already exists
    const { rows: existing } = await pool.query(
      'SELECT id, role FROM users WHERE email = $1',
      [ADMIN_EMAIL.toLowerCase()],
    );

    if (existing.length > 0) {
      const user = existing[0];
      if (user.role === 'admin') {
        console.log(`[create-admin] Admin account already exists for ${ADMIN_EMAIL} — no changes made.`);
      } else {
        // Promote existing account to admin
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', user.id]);
        console.log(`[create-admin] Existing account ${ADMIN_EMAIL} promoted to admin.`);
      }
      return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const id = uuidv4();
    const now = new Date();

    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, first_name, last_name, accepted_terms_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'admin', $4, $5, $6, NOW(), NOW())`,
      [id, ADMIN_EMAIL.toLowerCase(), passwordHash, 'Admin', 'LotLord', now],
    );

    console.log(`[create-admin] ✓ Admin account created:`);
    console.log(`  Email:    ${ADMIN_EMAIL}`);
    console.log(`  Role:     admin`);
    console.log(`  ID:       ${id}`);
    console.log('');
    console.log('  Keep these credentials secure and do not commit them to git.');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[create-admin] FAILED:', err.message);
  process.exit(1);
});
