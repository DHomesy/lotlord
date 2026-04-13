const { query } = require('../config/db');
const { parsePagination } = require('../lib/pagination');

/**
 * Append a single event to the audit log.
 * Fire-and-forget safe — callers should NOT await this in critical paths,
 * but can if they need confirmation.
 *
 * @param {object} opts
 * @param {string}  opts.action        - e.g. 'payment_created', 'lease_terminated'
 * @param {string}  opts.resourceType  - e.g. 'payment', 'lease', 'charge'
 * @param {string}  [opts.resourceId]  - UUID of the affected record
 * @param {object}  [opts.metadata]    - free-form context (amounts, old/new values, etc.)
 * @param {string}  [opts.userId]      - actor; null for system/background events
 * @param {string}  [opts.ipAddress]   - IP of the HTTP request (if available)
 */
async function log({ action, resourceType, resourceId, metadata, userId, ipAddress } = {}) {
  await query(
    `INSERT INTO audit_log (user_id, action, resource_type, resource_id, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId      || null,
      action,
      resourceType,
      resourceId  || null,
      metadata    ? JSON.stringify(metadata) : null,
      ipAddress   || null,
    ],
  );
}

/**
 * Fetch audit log entries with optional filters.
 *
 * @param {object} opts
 * @param {string}  [opts.userId]
 * @param {string}  [opts.resourceType]
 * @param {string}  [opts.resourceId]
 * @param {string}  [opts.action]         - prefix match (LIKE 'action%')
 * @param {string}  [opts.startDate]      - ISO date string
 * @param {string}  [opts.endDate]        - ISO date string
 * @param {number}  [opts.page=1]
 * @param {number}  [opts.limit=50]
 */
async function findAll({ userId, resourceType, resourceId, action, startDate, endDate, page = 1, limit = 50 } = {}) {
  const conditions = [];
  const values = [];

  if (userId) {
    values.push(userId);
    conditions.push(`al.user_id = $${values.length}`);
  }
  if (resourceType) {
    values.push(resourceType);
    conditions.push(`al.resource_type = $${values.length}`);
  }
  if (resourceId) {
    values.push(resourceId);
    conditions.push(`al.resource_id = $${values.length}`);
  }
  if (action) {
    values.push(`${action}%`);
    conditions.push(`al.action LIKE $${values.length}`);
  }
  if (startDate) {
    values.push(startDate);
    conditions.push(`al.created_at >= $${values.length}`);
  }
  if (endDate) {
    values.push(endDate);
    conditions.push(`al.created_at <= $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { limit: lim, offset } = parsePagination(page, limit, 200, 50);
  values.push(lim, offset);

  const { rows } = await query(
    `SELECT al.*,
            u.first_name || ' ' || u.last_name AS actor_name,
            u.email                             AS actor_email
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return rows;
}

module.exports = { log, findAll };
