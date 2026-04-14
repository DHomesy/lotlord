const { query } = require('../config/db');

/**
 * Store a verification token against a user.
 */
async function setVerifyToken(userId, token, expiresAt) {
  await query(
    `UPDATE users
     SET email_verify_token = $1,
         email_verify_token_expires_at = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [token, expiresAt, userId],
  );
}

/**
 * Find an unexpired token, returning the user row if found.
 */
async function findValidToken(token) {
  const { rows } = await query(
    `SELECT id, email, role, first_name, last_name,
            email_verified_at, email_verify_token_expires_at
     FROM users
     WHERE email_verify_token = $1
       AND email_verify_token_expires_at > NOW()
       AND deleted_at IS NULL
     LIMIT 1`,
    [token],
  );
  return rows[0] || null;
}

/**
 * Mark the user's email as verified and clear the token.
 */
async function markVerified(userId) {
  await query(
    `UPDATE users
     SET email_verified_at = NOW(),
         email_verify_token = NULL,
         email_verify_token_expires_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [userId],
  );
}

module.exports = { setVerifyToken, findValidToken, markVerified };
