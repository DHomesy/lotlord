const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

async function create({ id, token, invitedBy, firstName, lastName, email, phone, unitId, expiresAt, type = 'tenant' }) {
  const { rows } = await query(
    `INSERT INTO tenant_invitations
       (id, token, invited_by, first_name, last_name, email, phone, unit_id, expires_at, type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [id, token, invitedBy, firstName || null, lastName || null,
     email || null, phone || null, unitId || null, expiresAt, type],
  );
  return rows[0];
}

/** Look up a token and JOIN unit + property details for the signup form pre-fill. */
async function findByToken(token) {
  const { rows } = await query(
    `SELECT i.*,
            u.unit_number,
            p.name          AS property_name,
            p.address_line1 AS property_address
       FROM tenant_invitations i
       LEFT JOIN units      u ON u.id = i.unit_id
       LEFT JOIN properties p ON p.id = u.property_id
      WHERE i.token = $1
      LIMIT 1`,
    [token],
  );
  return rows[0] || null;
}

async function findAll({ page = 1, limit = 20, invitedBy = null } = {}) {
  const { limit: lim, offset } = parsePagination(page, limit);
  const values = [lim, offset];
  let where = '';
  if (invitedBy) { where = `WHERE i.invited_by = $${values.push(invitedBy)}`; }
  const { rows } = await query(
    `SELECT i.*,
            u.unit_number,
            p.name AS property_name,
            inv.first_name AS inviter_first_name,
            inv.last_name  AS inviter_last_name
       FROM tenant_invitations i
       LEFT JOIN units      u   ON u.id  = i.unit_id
       LEFT JOIN properties p   ON p.id  = u.property_id
       LEFT JOIN users      inv ON inv.id = i.invited_by
      ${where}
      ORDER BY i.created_at DESC
      LIMIT $1 OFFSET $2`,
    values,
  );
  return rows;
}

/** Mark the invitation accepted and record which tenant record was created. */
async function accept(token, tenantId, client = null) {
  const fn = client ? (sql, vals) => client.query(sql, vals) : query;
  const { rows } = await fn(
    `UPDATE tenant_invitations
        SET accepted_at = NOW(), tenant_id = $1
      WHERE token = $2
      RETURNING *`,
    [tenantId, token],
  );
  return rows[0];
}

/** Look up a single invitation by its primary key (for resend). */
async function findById(id) {
  const { rows } = await query(
    `SELECT i.*,
            u.unit_number,
            p.name          AS property_name,
            p.address_line1 AS property_address
       FROM tenant_invitations i
       LEFT JOIN units      u ON u.id = i.unit_id
       LEFT JOIN properties p ON p.id = u.property_id
      WHERE i.id = $1
      LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

/** Replace the token and extend the expiry (resend flow). */
async function refreshToken(id, token, expiresAt) {
  const { rows } = await query(
    `UPDATE tenant_invitations
        SET token = $1, expires_at = $2
      WHERE id = $3
      RETURNING *`,
    [token, expiresAt, id],
  );
  return rows[0];
}

async function remove(id) {
  await query('DELETE FROM tenant_invitations WHERE id = $1', [id]);
}

/**
 * Returns any non-accepted invitation for the given email that has not yet expired.
 * Used to prevent duplicate invites to the same address.
 */
async function findPendingByEmail(email) {
  const { rows } = await query(
    `SELECT id, email, expires_at FROM tenant_invitations
      WHERE email = $1
        AND accepted_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

module.exports = { create, findByToken, findAll, accept, findById, refreshToken, remove, findPendingByEmail };
