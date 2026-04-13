const { query } = require('../config/db');

/**
 * Create a new password reset token for a user.
 * Any previously unused tokens for this user remain valid until they expire —
 * the UI handles the "only one active request" UX.
 */
async function create({ id, userId, token, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id, userId, token, expiresAt],
  );
  return rows[0];
}

/**
 * Find a valid (unused, not expired) token row including the linked user.
 * Returns null if the token doesn't exist, is already used, or is expired.
 */
async function findValidToken(token) {
  const { rows } = await query(
    `SELECT prt.*, u.id AS user_id, u.email, u.role, u.first_name, u.last_name
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token = $1
       AND prt.used_at IS NULL
       AND prt.expires_at > NOW()
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [token],
  );
  return rows[0] || null;
}

/**
 * Mark a token as consumed so it cannot be replayed.
 */
async function markUsed(token) {
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1`,
    [token],
  );
}

/**
 * Delete expired / used tokens for a user (housekeeping, called on successful reset).
 */
async function deleteForUser(userId) {
  await query(
    `DELETE FROM password_reset_tokens WHERE user_id = $1`,
    [userId],
  );
}

module.exports = { create, findValidToken, markUsed, deleteForUser };
