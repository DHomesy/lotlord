const { Pool } = require('pg');
const { DATABASE_URL, NODE_ENV } = require('./env');

// In production, verify the server certificate by default.
// Set DATABASE_SSL_REJECT_UNAUTHORIZED=false in Railway if you need to use their
// self-signed cert and have not supplied a CA bundle via DATABASE_SSL_CA.
const sslConfig = (() => {
  if (NODE_ENV !== 'production') return false;
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  return {
    rejectUnauthorized,
    ...(process.env.DATABASE_SSL_CA && { ca: process.env.DATABASE_SSL_CA }),
  };
})();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig,
  max: 10,               // max pool connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Test the DB connection on startup.
 * Called from src/index.js before the server starts listening.
 */
async function connectDb() {
  const client = await pool.connect();
  console.log('[db] PostgreSQL connected');
  client.release();
}

/**
 * Execute a parameterised query.
 * Usage: const { rows } = await query('SELECT * FROM users WHERE id = $1', [id])
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[db] query (${Date.now() - start}ms):`, text.substring(0, 80));
  }
  return result;
}

/**
 * Grab a client for transactions.
 * Always release the client in a finally block.
 *
 * Example:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     await client.query(...);
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
async function getClient() {
  return pool.connect();
}

module.exports = { pool, connectDb, query, getClient };
