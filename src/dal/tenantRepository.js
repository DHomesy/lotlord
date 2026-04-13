const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

async function findAll({ page = 1, limit = 20, ownerId } = {}) {
  const { limit: lim, offset } = parsePagination(page, limit);

  if (ownerId) {
    // Scope to tenants who have at least one lease on a property owned by the given landlord
    const { rows } = await query(
      `SELECT DISTINCT t.*, u.email, u.first_name, u.last_name, u.phone
       FROM tenants t
       JOIN users u ON u.id = t.user_id
       JOIN leases l ON l.tenant_id = t.id
       JOIN units un ON un.id = l.unit_id
       JOIN properties p ON p.id = un.property_id
       WHERE t.deleted_at IS NULL AND p.owner_id = $3
       ORDER BY u.last_name ASC LIMIT $1 OFFSET $2`,
      [lim, offset, ownerId],
    );
    return rows;
  }

  const { rows } = await query(
    `SELECT t.*, u.email, u.first_name, u.last_name, u.phone
     FROM tenants t
     JOIN users u ON u.id = t.user_id
     WHERE t.deleted_at IS NULL
     ORDER BY u.last_name ASC LIMIT $1 OFFSET $2`,
    [lim, offset],
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT t.*, u.email, u.first_name, u.last_name, u.phone
     FROM tenants t
     JOIN users u ON u.id = t.user_id
     WHERE t.id = $1 AND t.deleted_at IS NULL LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function findByUserId(userId) {
  const { rows } = await query(
    'SELECT * FROM tenants WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1',
    [userId],
  );
  return rows[0] || null;
}

async function create({ id, userId, emergencyContactName, emergencyContactPhone, notes, emailOptIn = false, smsOptIn = false }, client = null) {
  const fn = client ? (sql, vals) => client.query(sql, vals) : query;
  const { rows } = await fn(
    `INSERT INTO tenants (id, user_id, emergency_contact_name, emergency_contact_phone, notes, email_opt_in, sms_opt_in)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, userId, emergencyContactName || null, emergencyContactPhone || null, notes || null, emailOptIn, smsOptIn],
  );
  return rows[0];
}

async function update(id, fields) {
  const allowed = {
    emergencyContactName:  'emergency_contact_name',
    emergencyContactPhone: 'emergency_contact_phone',
    notes:                 'notes',
    emailOptIn:            'email_opt_in',
    smsOptIn:              'sms_opt_in',
  };
  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const [key, col] of Object.entries(allowed)) {
    if (fields[key] !== undefined) {
      setClauses.push(`${col} = $${idx++}`);
      values.push(fields[key]);
    }
  }
  if (!setClauses.length) return null;
  values.push(id);

  const { rows } = await query(
    `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
    values,
  );
  return rows[0] || null;
}

async function softDelete(id) {
  await query('UPDATE tenants SET deleted_at = NOW() WHERE id = $1', [id]);
}

async function updateStripeCustomerId(id, stripeCustomerId) {
  await query(
    'UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2',
    [stripeCustomerId, id],
  );
}

module.exports = { findAll, findById, findByUserId, create, update, softDelete, updateStripeCustomerId };
