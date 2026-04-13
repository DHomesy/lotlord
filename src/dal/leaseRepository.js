const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

async function findAll({ tenantId, unitId, status, page = 1, limit = 20, ownerId } = {}) {
  const { limit: lim, offset } = parsePagination(page, limit);
  const values = [lim, offset];
  let where = 'WHERE 1=1';
  if (tenantId) { where += ` AND l.tenant_id = $${values.push(tenantId)}`; }
  if (unitId)   { where += ` AND l.unit_id = $${values.push(unitId)}`; }
  if (status)   { where += ` AND l.status = $${values.push(status)}`; }
  if (ownerId)  { where += ` AND p.owner_id = $${values.push(ownerId)}`; }

  const { rows } = await query(
    `SELECT l.*,
            u.unit_number, u.rent_amount AS unit_rent,
            p.name AS property_name,
            tn.id AS tenant_id,
            us.id AS user_id,
            us.first_name, us.last_name, us.email
     FROM leases l
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     JOIN tenants tn ON tn.id = l.tenant_id
     JOIN users us ON us.id = tn.user_id
     ${where}
     ORDER BY l.start_date DESC LIMIT $1 OFFSET $2`,
    values,
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT l.*,
            u.unit_number, u.rent_amount AS unit_rent,
            p.name AS property_name, p.address_line1, p.owner_id,
            tn.id AS tenant_record_id,
            us.id AS user_id,
            us.first_name, us.last_name, us.email, us.phone
     FROM leases l
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     JOIN tenants tn ON tn.id = l.tenant_id
     JOIN users us ON us.id = tn.user_id
     WHERE l.id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function create({ id, unitId, tenantId, startDate, endDate, monthlyRent, depositAmount, lateFeeAmount, lateFeeGraceDays, documentUrl }) {
  const { rows } = await query(
    `INSERT INTO leases (id, unit_id, tenant_id, start_date, end_date, monthly_rent,
                         deposit_amount, late_fee_amount, late_fee_grace_days, document_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, unitId, tenantId, startDate, endDate, monthlyRent,
     depositAmount || null, lateFeeAmount || 0, lateFeeGraceDays || 5, documentUrl || null],
  );
  return rows[0];
}

async function update(id, fields, client = null) {
  const fn = client ? (sql, vals) => client.query(sql, vals) : query;
  const allowed = {
    status: 'status', depositStatus: 'deposit_status', signedAt: 'signed_at',
    documentUrl: 'document_url', monthlyRent: 'monthly_rent',
    endDate: 'end_date', lateFeeAmount: 'late_fee_amount', lateFeeGraceDays: 'late_fee_grace_days',
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
  setClauses.push('updated_at = NOW()');
  values.push(id);

  const { rows } = await fn(
    `UPDATE leases SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return rows[0] || null;
}

/** Used by scheduled jobs — leases expiring within `days` days */
async function findExpiringWithin(days) {
  const { rows } = await query(
    `SELECT l.*, us.id AS user_id, us.email, us.first_name, us.last_name, us.phone,
            u.unit_number, p.name AS property_name
     FROM leases l
     JOIN tenants t ON t.id = l.tenant_id
     JOIN users us ON us.id = t.user_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE l.status = 'active'
       AND l.end_date BETWEEN NOW() AND NOW() + ($1 || ' days')::INTERVAL`,
    [days],
  );
  return rows;
}

module.exports = { findAll, findById, create, update, findExpiringWithin };
