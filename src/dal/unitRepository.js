const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

async function findAll({ propertyId, status, ownerId, page = 1, limit = 50 } = {}) {
  const { limit: lim, offset } = parsePagination(page, limit, 200, 50);
  const values = [lim, offset];
  let where = 'WHERE u.deleted_at IS NULL';
  if (propertyId) { where += ` AND u.property_id = $${values.push(propertyId)}`; }
  if (status)     { where += ` AND u.status = $${values.push(status)}`; }
  if (ownerId)    { where += ` AND p.owner_id = $${values.push(ownerId)}`; }

  const { rows } = await query(
    `SELECT u.*,
            p.name          AS property_name,
            p.address_line1 AS property_address
     FROM units u
     LEFT JOIN properties p ON p.id = u.property_id
     ${where}
     ORDER BY p.address_line1 ASC, u.unit_number ASC
     LIMIT $1 OFFSET $2`,
    values,
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM units WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({ id, propertyId, unitNumber, floor, bedrooms, bathrooms, sqFt, rentAmount, depositAmount, status }) {
  const { rows } = await query(
    `INSERT INTO units (id, property_id, unit_number, floor, bedrooms, bathrooms, sq_ft, rent_amount, deposit_amount, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, propertyId, unitNumber, floor || null, bedrooms || null, bathrooms || null, sqFt || null, rentAmount, depositAmount || null, status || 'vacant'],
  );
  return rows[0];
}

async function update(id, fields, client = null) {
  const fn = client ? (sql, vals) => client.query(sql, vals) : query;
  const allowed = { unitNumber: 'unit_number', floor: 'floor', bedrooms: 'bedrooms', bathrooms: 'bathrooms', sqFt: 'sq_ft', rentAmount: 'rent_amount', depositAmount: 'deposit_amount', status: 'status' };
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
    `UPDATE units SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return rows[0] || null;
}

async function remove(id) {
  await query('UPDATE units SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
}

module.exports = { findAll, findById, create, update, remove };
