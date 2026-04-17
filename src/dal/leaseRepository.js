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

// ── Co-tenants ────────────────────────────────────────────────────────────────
// These functions support the co-tenant feature introduced in migration 023.
// A lease has one primary tenant and up to 5 co-tenants via lease_co_tenants.
// All portal access checks should use tenantCanAccessLease — never compare
// tenant_id directly, as co-tenants would be incorrectly excluded.

/**
 * Returns all leases on which tenantId appears — either as the primary tenant
 * on leases.tenant_id, or as a co-tenant in lease_co_tenants.
 *
 * Adds an `is_co_tenant` boolean column so callers can distinguish the two.
 * Results are ordered newest start_date first.
 *
 * @param {string} tenantId  — tenants.id (UUID)
 */
async function findAllForTenant(tenantId) {
  const { rows } = await query(
    `SELECT l.*,
            u.unit_number, u.rent_amount AS unit_rent,
            p.name AS property_name,
            tn.id  AS tenant_id,
            us.id  AS user_id,
            us.first_name, us.last_name, us.email,
            CASE WHEN l.tenant_id = $1 THEN false ELSE true END AS is_co_tenant
     FROM leases l
     JOIN units u      ON u.id  = l.unit_id
     JOIN properties p ON p.id  = u.property_id
     JOIN tenants tn   ON tn.id = l.tenant_id
     JOIN users us     ON us.id = tn.user_id
     WHERE l.tenant_id = $1
        OR EXISTS (
             SELECT 1 FROM lease_co_tenants lct
             WHERE lct.lease_id = l.id AND lct.tenant_id = $1
           )
     ORDER BY l.start_date DESC`,
    [tenantId],
  );
  return rows;
}

/**
 * Returns true when tenantId is authorised to access the lease: i.e. they are
 * either the primary tenant (leases.tenant_id) or listed in lease_co_tenants.
 *
 * Use this in every controller that gates on tenant identity — do NOT do a
 * direct `lease.tenant_record_id === tenantId` comparison.
 *
 * Returns false (not a 403) so the caller decides the response code.
 *
 * @param {string} leaseId   — leases.id (UUID)
 * @param {string} tenantId  — tenants.id (UUID)
 * @returns {Promise<boolean>}
 */
async function tenantCanAccessLease(leaseId, tenantId) {
  if (!leaseId || !tenantId) return false;
  const { rows } = await query(
    `SELECT 1 FROM leases WHERE id = $1 AND tenant_id = $2
     UNION ALL
     SELECT 1 FROM lease_co_tenants WHERE lease_id = $1 AND tenant_id = $2
     LIMIT 1`,
    [leaseId, tenantId],
  );
  return rows.length > 0;
}

/**
 * Returns all co-tenants for a lease, joined with tenant + user info.
 * Does NOT include the primary tenant — that is already on the lease row.
 * Ordered by when the co-tenant was added (oldest first).
 *
 * @param {string} leaseId — leases.id (UUID)
 */
async function findCoTenants(leaseId) {
  const { rows } = await query(
    `SELECT lct.id AS co_tenant_row_id, lct.created_at AS added_at,
            t.id   AS tenant_id,
            u.id   AS user_id,
            u.first_name, u.last_name, u.email, u.phone
     FROM lease_co_tenants lct
     JOIN tenants t ON t.id  = lct.tenant_id
     JOIN users u   ON u.id  = t.user_id
     WHERE lct.lease_id = $1
     ORDER BY lct.created_at ASC`,
    [leaseId],
  );
  return rows;
}

/**
 * Adds a co-tenant to a lease.
 *
 * Enforces a maximum of 5 co-tenants per lease (6 occupants total including
 * the primary tenant). Throws a 422 if the cap is already reached.
 *
 * The INSERT uses ON CONFLICT DO NOTHING — duplicate additions are silently
 * ignored and return null instead of throwing.
 *
 * @param {string} leaseId   — leases.id (UUID)
 * @param {string} tenantId  — tenants.id of the new co-tenant (UUID)
 * @returns {Promise<object|null>}  inserted lease_co_tenants row, or null if already exists
 */
async function addCoTenant(leaseId, tenantId) {
  const { rows: cnt } = await query(
    'SELECT COUNT(*)::int AS n FROM lease_co_tenants WHERE lease_id = $1',
    [leaseId],
  );
  if (cnt[0].n >= 5) {
    throw Object.assign(
      new Error('A lease may have at most 5 co-tenants (6 people total including the primary tenant).'),
      { status: 422 },
    );
  }
  const { rows } = await query(
    `INSERT INTO lease_co_tenants (lease_id, tenant_id)
     VALUES ($1, $2)
     ON CONFLICT (lease_id, tenant_id) DO NOTHING
     RETURNING *`,
    [leaseId, tenantId],
  );
  return rows[0] || null;
}

/**
 * Removes a co-tenant from a lease. No-op if the pair does not exist.
 *
 * @param {string} leaseId   — leases.id (UUID)
 * @param {string} tenantId  — tenants.id of the co-tenant to remove (UUID)
 */
async function removeCoTenant(leaseId, tenantId) {
  await query(
    'DELETE FROM lease_co_tenants WHERE lease_id = $1 AND tenant_id = $2',
    [leaseId, tenantId],
  );
}

module.exports = {
  findAll, findById, create, update, findExpiringWithin,
  findAllForTenant, tenantCanAccessLease,
  findCoTenants, addCoTenant, removeCoTenant,
};
