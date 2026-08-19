const { query } = require('../config/db');

async function getUpcomingDues({ ownerId, daysAhead = 14, limit = 10 }) {
  const { rows } = await query(
    `WITH paid_by_charge AS (
       SELECT rp.charge_id, COALESCE(SUM(rp.amount_paid), 0) AS total_paid
       FROM rent_payments rp
       WHERE rp.status = 'completed'
       GROUP BY rp.charge_id
     )
     SELECT
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
     LEFT JOIN paid_by_charge paid ON paid.charge_id = rc.id
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
    `WITH paid_by_charge AS (
       SELECT rp.charge_id, COALESCE(SUM(rp.amount_paid), 0) AS total_paid
       FROM rent_payments rp
       WHERE rp.status = 'completed'
       GROUP BY rp.charge_id
     )
     SELECT
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
     LEFT JOIN paid_by_charge paid ON paid.charge_id = rc.id
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
    `WITH latest_ledger AS (
       SELECT DISTINCT ON (le.lease_id)
         le.lease_id,
         le.balance_after
       FROM ledger_entries le
       ORDER BY le.lease_id, le.created_at DESC
     )
     SELECT
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
     JOIN latest_ledger latest ON latest.lease_id = l.id
     WHERE p.owner_id = $1
       AND l.status IN ('active', 'pending')
       AND latest.balance_after > 0
     ORDER BY latest.balance_after DESC
     LIMIT $2`,
    [ownerId, limit],
  );
  return rows;
}

async function getAgingSummary({ ownerId }) {
  const { rows } = await query(
    `WITH paid_by_charge AS (
       SELECT rp.charge_id, COALESCE(SUM(rp.amount_paid), 0) AS total_paid
       FROM rent_payments rp
       WHERE rp.status = 'completed'
       GROUP BY rp.charge_id
     ),
     overdue AS (
       SELECT
         GREATEST(rc.amount - COALESCE(paid.total_paid, 0), 0)::NUMERIC AS amount_due,
         (CURRENT_DATE - rc.due_date)::INT AS days_overdue
       FROM rent_charges rc
       JOIN units un ON un.id = rc.unit_id AND un.deleted_at IS NULL
       JOIN properties p ON p.id = un.property_id AND p.deleted_at IS NULL
       LEFT JOIN paid_by_charge paid ON paid.charge_id = rc.id
       WHERE p.owner_id = $1
         AND rc.voided_at IS NULL
         AND rc.due_date < CURRENT_DATE
         AND GREATEST(rc.amount - COALESCE(paid.total_paid, 0), 0) > 0
     )
     SELECT
       CASE
         WHEN days_overdue BETWEEN 1 AND 30 THEN '1-30'
         WHEN days_overdue BETWEEN 31 AND 60 THEN '31-60'
         WHEN days_overdue BETWEEN 61 AND 90 THEN '61-90'
         ELSE '90+'
       END AS bucket,
       COUNT(*)::INT AS charge_count,
       SUM(amount_due)::NUMERIC AS total_amount
     FROM overdue
     GROUP BY 1
     ORDER BY
       CASE bucket
         WHEN '1-30' THEN 1
         WHEN '31-60' THEN 2
         WHEN '61-90' THEN 3
         ELSE 4
       END`,
    [ownerId],
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
  getAgingSummary,
  getMaintenanceOverview,
};
