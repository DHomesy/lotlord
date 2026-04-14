/**
 * Admin account update script.
 * ----------------------------------
 * Updates the email and/or password of an existing admin account.
 * Looks up the account by OLD_EMAIL, then applies the new values.
 *
 * Usage:
 *   OLD_EMAIL=old@example.com NEW_EMAIL=new@example.com NEW_PASSWORD=newpassword node scripts/update-admin.js
 *
 * Or with .env loaded (set the vars in your shell / Railway env override):
 *   node scripts/update-admin.js
 *
 * Required env vars:
 *   DATABASE_URL  — Postgres connection string
 *   OLD_EMAIL     — Current email of the admin account to update
 *   NEW_EMAIL     — New email address  (omit to keep existing)
 *   NEW_PASSWORD  — New password (min 8 chars)  (omit to keep existing)
 *
 * At least one of NEW_EMAIL or NEW_PASSWORD must be provided.
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL;
const OLD_EMAIL    = process.env.OLD_EMAIL;
const NEW_EMAIL    = process.env.NEW_EMAIL;
const NEW_PASSWORD = process.env.NEW_PASSWORD;

if (!DATABASE_URL) {
  console.error('[update-admin] ERROR: DATABASE_URL is required');
  process.exit(1);
}
if (!OLD_EMAIL) {
  console.error('[update-admin] ERROR: OLD_EMAIL is required (the current email of the account to update)');
  process.exit(1);
}
if (!NEW_EMAIL && !NEW_PASSWORD) {
  console.error('[update-admin] ERROR: Provide at least one of NEW_EMAIL or NEW_PASSWORD');
  process.exit(1);
}
if (NEW_PASSWORD && NEW_PASSWORD.length < 8) {
  console.error('[update-admin] ERROR: NEW_PASSWORD must be at least 8 characters');
  process.exit(1);
}

async function run() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    // Look up the existing account
    const { rows } = await pool.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      [OLD_EMAIL.toLowerCase().trim()],
    );

    if (rows.length === 0) {
      console.error(`[update-admin] ERROR: No account found with email "${OLD_EMAIL}"`);
      process.exit(1);
    }

    const user = rows[0];
    console.log(`[update-admin] Found account: ${user.email} (role: ${user.role}, id: ${user.id})`);

    // Build the SET clause dynamically based on what was provided
    const setClauses = ['updated_at = NOW()'];
    const params = [];

    if (NEW_EMAIL) {
      // Ensure the new email isn't already taken by a different account
      const { rows: conflict } = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [NEW_EMAIL.toLowerCase().trim(), user.id],
      );
      if (conflict.length > 0) {
        console.error(`[update-admin] ERROR: Email "${NEW_EMAIL}" is already in use by another account`);
        process.exit(1);
      }
      params.push(NEW_EMAIL.toLowerCase().trim());
      setClauses.push(`email = $${params.length}`);
    }

    if (NEW_PASSWORD) {
      const hash = await bcrypt.hash(NEW_PASSWORD, 12);
      params.push(hash);
      setClauses.push(`password_hash = $${params.length}`);
    }

    // WHERE clause param
    params.push(user.id);
    const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${params.length}`;

    await pool.query(sql, params);

    console.log('[update-admin] ✓ Account updated successfully:');
    if (NEW_EMAIL) console.log(`  Email:    ${OLD_EMAIL}  →  ${NEW_EMAIL}`);
    if (NEW_PASSWORD) console.log('  Password: [updated]');
    console.log('');
    console.log('  Keep these credentials secure and do not commit them to git.');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[update-admin] FAILED:', err.message);
  process.exit(1);
});
