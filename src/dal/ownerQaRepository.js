const { query } = require('../config/db');

async function getUpcomingDues({ ownerId, daysAhead = 14, limit = 10 }) {
  const { rows } = await query(
    `SELECT
       rc.id AS charge_id,
       COALESCE(u.id, t.user_id) AS tenant_user_id,
       TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS tenant_name,
       p.name AS property_name,
       un.unit_number,
       rc.due_date,
       GREATEST(rc.amount - COALESCE(paid.total_paid, 0), 0)::NUMERIC AS amount_due
     FROM rent_charges rc
     JOIN units un ON un.id = rc.unit_id AND un.deleted_at IS NULL
     JOIN properties p ON p.id = un.property_id AND p.deleted_at IS NULL
     LEFT JOIN leases l ON l.id = rc.lease_id
     LEFT JOIN tenants t ON t.id = COALESCE(rc.tenant_id, l.tenant_id)
     LEFT JOIN users u ON u.id = t.user_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(rp.amount_paid), 0) AS total_paid
       FROM rent_payments rp
       WHERE rp.charge_id = rc.id
         AND rp.status = 'completed'
     ) paid ON TRUE
     WHERE p.owner_id = $1
       AND rc.voided_at IS NULL
       AND rc.due_date >= CURRENT_DATE
       AND rc.due_date <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
       AND GREATEST(rc.amount - COALESCE(paid.total_paid, 0), 0) > 0
     ORDER BY rc.due_date ASC, amount_due DESC
     LIMIT $3`,
    [ownerId, daysAhead, limit],
  );
  return rows;
}

async function getPastDueTenants({ ownerId, limit = 10 }) {
  const { rows } = await query(
    `SELECT
       COALESCE(u.id, t.user_id) AS tenant_user_id,
       TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS tenant_name,
       COUNT(*)::INT AS overdue_charges,
       MIN(rc.due_date) AS oldest_due_date,
       SUM(GREATEST(rc.amount - COALESCE(paid.total_paid, 0), 0))::NUMERIC AS overdue_amount
     FROM rent_charges rc
     JOIN units un ON un.id = rc.unit_id AND un.deleted_at IS NULL
     JOIN properties p ON p.id = un.property_id AND p.deleted_at IS NULL
     LEFT JOIN leases l ON l.id = rc.lease_id
     LEFT JOIN tenants t ON t.id = COALESCE(rc.tenant_id, l.tenant_id)
     LEFT JOIN users u ON u.id = t.user_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(rp.amount_paid), 0) AS total_paid
       FROM rent_payments rp
       WHERE rp.charge_id = rc.id
         AND rp.status = 'completed'
     ) paid ON TRUE
     WHERE p.owner_id = $1
       AND rc.voided_at IS NULL
       AND rc.due_date < CURRENT_DATE
       AND GREATEST(rc.amount - COALESCE(paid.total_paid, 0), 0) > 0
     GROUP BY COALESCE(u.id, t.user_id), tenant_name
     ORDER BY overdue_amount DESC, oldest_due_date ASC
     LIMIT $2`,
    [ownerId, limit],
  );
  return rows;
}

async function getTenantBalances({ ownerId, limit = 10 }) {
  const { rows } = await query(
    `SELECT
       u.id AS tenant_user_id,
       TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS tenant_name,
       p.name AS property_name,
       un.unit_number,
       latest.balance_after::NUMERIC AS balance
     FROM leases l
     JOIN tenants t ON t.id = l.tenant_id
     JOIN users u ON u.id = t.user_id
     JOIN units un ON un.id = l.unit_id AND un.deleted_at IS NULL
     JOIN properties p ON p.id = un.property_id AND p.deleted_at IS NULL
     JOIN LATERAL (
       SELECT le.balance_after
       FROM ledger_entries le
       WHERE le.lease_id = l.id
       ORDER BY le.created_at DESC
       LIMIT 1
     ) latest ON TRUE
     WHERE p.owner_id = $1
       AND l.status IN ('active', 'pending')
       AND latest.balance_after > 0
     ORDER BY latest.balance_after DESC
     LIMIT $2`,
    [ownerId, limit],
  );
  return rows;
}

async function getMaintenanceOverview({ ownerId, limit = 10 }) {
  const [summaryResult, recentResult] = await Promise.all([
    query(
      `SELECT
         mr.status,
         mr.priority,
         COUNT(*)::INT AS count
       FROM maintenance_requests mr
       JOIN units un ON un.id = mr.unit_id AND un.deleted_at IS NULL
       JOIN properties p ON p.id = un.property_id AND p.deleted_at IS NULL
       WHERE p.owner_id = $1
         AND mr.status IN ('open', 'in_progress', 'completed')
       GROUP BY mr.status, mr.priority
       ORDER BY mr.status ASC, mr.priority ASC`,
      [ownerId],
    ),
    query(
      `SELECT
         mr.id,
         mr.title,
         mr.status,
         mr.priority,
         mr.category,
         mr.created_at,
         p.name AS property_name,
         un.unit_number
       FROM maintenance_requests mr
       JOIN units un ON un.id = mr.unit_id AND un.deleted_at IS NULL
       JOIN properties p ON p.id = un.property_id AND p.deleted_at IS NULL
       WHERE p.owner_id = $1
         AND mr.status IN ('open', 'in_progress', 'completed')
       ORDER BY mr.created_at DESC
       LIMIT $2`,
      [ownerId, limit],
    ),
  ]);

  return {
    summary: summaryResult.rows,
    recent: recentResult.rows,
  };
}

module.exports = {
  getUpcomingDues,
  getPastDueTenants,
  getTenantBalances,
  getMaintenanceOverview,
};
