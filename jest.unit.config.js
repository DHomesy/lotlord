/**
 * Jest config for pure unit tests (no database required).
 *
 * Run with:  npm run test:unit
 *
 * This config omits globalSetup (which connects to the DB to run migrations)
 * so pure-function tests can run locally without a DATABASE_URL.
 */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
  testMatch: ['**/tests/unit/**/*.test.js'],
  setupFiles: ['dotenv/config'],
  // globalSetup intentionally omitted — no DB needed for unit tests
};
