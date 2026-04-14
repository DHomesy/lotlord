const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

async function findAll({ ownerId, page = 1, limit = 20 } = {}) {
  const { limit: limitNum, offset } = parsePagination(page, limit);
  const values = [limitNum, offset];
  let where = 'WHERE deleted_at IS NULL';
  if (ownerId) { where += ` AND owner_id = $3`; values.push(ownerId); }

  const { rows } = await query(
    `SELECT * FROM properties ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    values,
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM properties WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({ id, ownerId, name, addressLine1, addressLine2, city, state, zip, country, propertyType }) {
  const { rows } = await query(
    `INSERT INTO properties (id, owner_id, name, address_line1, address_line2, city, state, zip, country, property_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, ownerId, name, addressLine1, addressLine2 || null, city, state, zip, country || 'US', propertyType || null],
  );
  return rows[0];
}

async function update(id, fields) {
  const allowed = { name: 'name', addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city', state: 'state', zip: 'zip', country: 'country', propertyType: 'property_type' };
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

  const { rows } = await query(
    `UPDATE properties SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return rows[0] || null;
}

async function remove(id) {
  await query('UPDATE properties SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
}

/**
 * Archive a property and all its units in a single transaction:
 *  1. Terminate active/pending leases for all units
 *  2. Soft-delete all units
 *  3. Soft-delete the property
 */
async function cascadeArchive(id) {
  // Terminate leases before archiving units so jobs/reminders stop firing
  await query(
    `UPDATE leases
     SET    status = 'terminated', updated_at = NOW()
     WHERE  unit_id IN (SELECT id FROM units WHERE property_id = $1)
       AND  status IN ('active', 'pending')`,
    [id],
  );
  await query(
    `UPDATE units
     SET    deleted_at = NOW(), updated_at = NOW()
     WHERE  property_id = $1 AND deleted_at IS NULL`,
    [id],
  );
  await query(
    `UPDATE properties
     SET    deleted_at = NOW(), updated_at = NOW()
     WHERE  id = $1`,
    [id],
  );
}

module.exports = { findAll, findById, create, update, remove, cascadeArchive };
