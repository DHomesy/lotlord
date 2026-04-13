const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

/**
 * List documents visible to the calling user.
 *   - Landlord/admin: all documents where owner_id = userId
 *   - Tenant: documents where related_id matches any of their lease/tenant records,
 *             OR documents explicitly shared with them (uploaded_by = userId).
 */
async function findAll({ ownerId, tenantUserId, relatedId, relatedType, category, page = 1, limit = 50 } = {}) {
  const conditions = [];
  const params = [];
  let i = 1;
  const { limit: limitNum, offset } = parsePagination(page, limit, 200, 50);

  if (ownerId) {
    conditions.push(`d.owner_id = $${i++}`);
    params.push(ownerId);
  }

  if (tenantUserId) {
    // Tenants only see documents they themselves uploaded.
    // Landlord-managed docs (lease agreements etc.) require explicit sharing — not auto-exposed.
    conditions.push(`d.uploaded_by = $${i++}`);
    params.push(tenantUserId);
  }

  if (relatedId) {
    conditions.push(`d.related_id = $${i++}`);
    params.push(relatedId);
  }

  if (relatedType) {
    conditions.push(`d.related_type = $${i++}`);
    params.push(relatedType);
  }

  if (category) {
    conditions.push(`d.category = $${i++}`);
    params.push(category);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limitNum, offset);

  const { rows } = await query(
    `SELECT d.id, d.owner_id, d.related_id, d.related_type,
            d.file_url, d.file_name, d.file_type, d.category,
            d.uploaded_by, d.created_at,
            u.first_name || ' ' || u.last_name AS uploaded_by_name
     FROM documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     ${where}
     ORDER BY d.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    params,
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT d.*, u.first_name || ' ' || u.last_name AS uploaded_by_name
     FROM documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function create({ id, ownerId, relatedId, relatedType, fileUrl, fileName, fileType, category, uploadedBy }) {
  const { rows } = await query(
    `INSERT INTO documents (id, owner_id, related_id, related_type, file_url, file_name, file_type, category, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [id, ownerId, relatedId || null, relatedType || null, fileUrl, fileName || null, fileType || null, category || null, uploadedBy],
  );
  return rows[0];
}

async function remove(id) {
  const { rows } = await query(
    `DELETE FROM documents WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0] || null;
}

/**
 * Efficiently checks whether a document is accessible to a tenant in a single query.
 * Returns the document row if accessible, or null if not.
 */
// Consistent with findAll: tenants may only access documents they uploaded.
async function findByIdForTenant(id, tenantUserId) {
  const { rows } = await query(
    `SELECT d.id FROM documents d
     WHERE d.id = $1 AND d.uploaded_by = $2 LIMIT 1`,
    [id, tenantUserId],
  );
  return rows[0] || null;
}

module.exports = { findAll, findById, findByIdForTenant, create, remove };
