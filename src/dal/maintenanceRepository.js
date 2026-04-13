const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

// ── Maintenance Requests ──────────────────────────────────────────────────────

async function findAll({ unitId, status, assignedTo, submittedBy, ownerId, page = 1, limit = 20 } = {}) {
  const { limit: lim, offset } = parsePagination(page, limit);
  const values = [lim, offset];
  const conditions = ['1=1'];
  let idx = 3;

  if (unitId)      { conditions.push(`r.unit_id = $${idx++}`);      values.push(unitId); }
  if (status)      { conditions.push(`r.status = $${idx++}`);        values.push(status); }
  if (assignedTo)  { conditions.push(`r.assigned_to = $${idx++}`);   values.push(assignedTo); }
  if (submittedBy) { conditions.push(`r.submitted_by = $${idx++}`);  values.push(submittedBy); }
  if (ownerId)     { conditions.push(`p.owner_id = $${idx++}`);      values.push(ownerId); }

  const { rows } = await query(
    `SELECT r.*,
            u.unit_number,
            p.name          AS property_name,
            p.id            AS property_id,
            p.address_line1 AS property_address
       FROM maintenance_requests r
       JOIN units      u ON u.id = r.unit_id
       JOIN properties p ON p.id = u.property_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE r.priority
          WHEN 'emergency' THEN 1
          WHEN 'high'      THEN 2
          WHEN 'medium'    THEN 3
          WHEN 'low'       THEN 4
        END,
        r.created_at DESC
      LIMIT $1 OFFSET $2`,
    values,
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT r.*,
            u.unit_number,
            p.name          AS property_name,
            p.id            AS property_id,
            p.address_line1 AS property_address,
            p.owner_id
       FROM maintenance_requests r
       JOIN units      u ON u.id = r.unit_id
       JOIN properties p ON p.id = u.property_id
      WHERE r.id = $1
      LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function create({ id, unitId, submittedBy, category, priority, title, description }) {
  const { rows } = await query(
    `INSERT INTO maintenance_requests
       (id, unit_id, submitted_by, category, priority, title, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [id, unitId, submittedBy, category, priority || 'medium', title, description || null],
  );
  return rows[0];
}

async function update(id, fields) {
  const allowed = {
    assignedTo:  'assigned_to',
    category:    'category',
    priority:    'priority',
    title:       'title',
    description: 'description',
    status:      'status',
    resolvedAt:  'resolved_at',
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

  const { rows } = await query(
    `UPDATE maintenance_requests SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return rows[0] || null;
}

// ── Attachments ───────────────────────────────────────────────────────────────

async function findAttachments(requestId) {
  const { rows } = await query(
    `SELECT * FROM maintenance_attachments WHERE request_id = $1 ORDER BY created_at ASC`,
    [requestId],
  );
  return rows;
}

async function findAttachmentById(id) {
  const { rows } = await query(
    `SELECT * FROM maintenance_attachments WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function addAttachment({ id, requestId, fileUrl, fileName, fileType, uploadedBy }) {
  const { rows } = await query(
    `INSERT INTO maintenance_attachments (id, request_id, file_url, file_name, file_type, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [id, requestId, fileUrl, fileName || null, fileType || null, uploadedBy],
  );
  return rows[0];
}

async function removeAttachment(id) {
  await query('DELETE FROM maintenance_attachments WHERE id = $1', [id]);
}

async function removeAllAttachments(requestId) {
  await query('DELETE FROM maintenance_attachments WHERE request_id = $1', [requestId]);
}

async function deleteById(id) {
  await query('DELETE FROM maintenance_requests WHERE id = $1', [id]);
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  deleteById,
  findAttachments,
  findAttachmentById,
  addAttachment,
  removeAttachment,
  removeAllAttachments,
};
