/**
 * Jest globalSetup — runs once before all test suites.
 *
 * Applies any pending SQL migrations to the test database so the schema is
 * always up-to-date before tests run. This prevents failures caused by new
 * columns (e.g. token_version) not yet existing in the test DB.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

module.exports = async function globalSetup() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });
  const client = await pool.connect();
  try {
    // Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id          SERIAL PRIMARY KEY,
        filename    TEXT UNIQUE NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM _migrations ORDER BY id');
    const applied = new Set(rows.map((r) => r.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[test:migrate] Applying ${file}`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[test:migrate] Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};
