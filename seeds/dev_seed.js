/**
 * Development grant script â€” upgrades a landlord account to enterprise plan.
 * Run: npm run seed
 *
 * This script does NOT delete any data. All existing properties, tenants,
 * leases, and charges are preserved.
 *
 * Configure the target account via your .env file (never put real email
 * addresses directly in this file â€” .env is gitignored, this file is not).
 *
 * Required in .env:
 *   SEED_LANDLORD_EMAIL   email of the landlord account to upgrade
 *
 * Falls back to 'landlord@lotlord.app' if the variable is not set (CI/other devs).
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const LANDLORD_EMAIL = process.env.SEED_LANDLORD_EMAIL || 'landlord@lotlord.app';

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`[seed] Granting enterprise plan to ${LANDLORD_EMAIL}...`);

    const result = await client.query(
      `UPDATE users
          SET subscription_status  = 'active',
              subscription_plan    = 'enterprise',
              ai_enabled           = true,
              ai_reply_mode        = 'approval',
              ai_notify_on_send    = true,
              ai_notify_channels   = ARRAY['email'],
              updated_at           = NOW()
        WHERE email = $1
        RETURNING id, email, role`,
      [LANDLORD_EMAIL],
    );

    if (result.rowCount === 0) {
      throw new Error(
        `No user found with email "${LANDLORD_EMAIL}". ` +
        `Create the account first, then re-run npm run seed.`,
      );
    }

    const user = result.rows[0];
    if (user.role !== 'landlord') {
      throw new Error(
        `User "${LANDLORD_EMAIL}" has role "${user.role}" â€” expected "landlord". ` +
        `Only landlord accounts can hold a subscription plan.`,
      );
    }

    await client.query('COMMIT');
    console.log('\n[seed] Done âœ“');
    console.log('');
    console.log(`  ${user.email}  â†’  enterprise plan, AI inbox enabled (approval mode)`);
    console.log('');
    console.log('  No data was deleted. All existing properties, tenants, and leases are intact.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] Failed, rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
