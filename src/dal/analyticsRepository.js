const db = require('../config/db');

/**
 * Returns all metrics for the dashboard in a single parallel query set.
 * @param {string|null} ownerId — when present, scopes all queries to a single landlord's properties.
 *                                Pass null for admin (system-wide view).
 */
async function getDashboardMetrics(ownerId = null) {
  const p = ownerId ? [ownerId] : [];
  // Property ownership filter — added to every query when a landlord is the caller.
  // Uses $1 = ownerId (only param in these aggregate queries).
  const ownerWhere = ownerId ? 'AND p.owner_id = $1' : '';

  const [
    incomeResult,
    unpaidResult,
    occupancyResult,
    paymentsResult,
    maintenanceResult,
  ] = await Promise.all([
    // Monthly income — sum of monthly_rent for all active leases
    db.query(`
      SELECT COALESCE(SUM(l.monthly_rent), 0)::NUMERIC AS monthly_income
      FROM   leases l
      JOIN   units      u ON u.id = l.unit_id
      JOIN   properties p ON p.id = u.property_id
      WHERE  l.status = 'active'
      ${ownerWhere}
    `, p),

    // Unpaid dues — charges past their due date not yet fully covered by payments
    db.query(`
      SELECT COALESCE(SUM(rc.amount - COALESCE(paid.total, 0)), 0)::NUMERIC AS unpaid_dues
      FROM   rent_charges rc
      JOIN   units      u ON u.id = rc.unit_id
      JOIN   properties p ON p.id = u.property_id
      LEFT JOIN (
        SELECT charge_id, SUM(amount_paid) AS total
        FROM   rent_payments
        WHERE  status = 'completed'
        GROUP  BY charge_id
      ) paid ON paid.charge_id = rc.id
      WHERE  rc.due_date < CURRENT_DATE
        AND  rc.voided_at IS NULL
        AND  COALESCE(paid.total, 0) < rc.amount
      ${ownerWhere}
    `, p),

    // Occupancy — based on unit status column
    db.query(`
      SELECT
        COUNT(*)                                            AS total_units,
        COUNT(CASE WHEN u.status = 'occupied' THEN 1 END)  AS occupied_units
      FROM   units      u
      JOIN   properties p ON p.id = u.property_id
      WHERE  TRUE
      ${ownerWhere}
    `, p),

    // Recent payments — last 5, with tenant name and property info
    db.query(`
      SELECT
        rp.id,
        rp.amount_paid,
        rp.payment_date,
        rp.payment_method,
        rp.status,
        u.first_name,
        u.last_name,
        p.address_line1,
        un.unit_number
      FROM   rent_payments rp
      JOIN   leases      l  ON l.id   = rp.lease_id
      JOIN   tenants     t  ON t.id   = l.tenant_id
      JOIN   users       u  ON u.id   = t.user_id
      JOIN   units       un ON un.id  = l.unit_id
      JOIN   properties  p  ON p.id   = un.property_id
      WHERE  TRUE
      ${ownerWhere}
      ORDER  BY rp.created_at DESC
      LIMIT  5
    `, p),

    // Recent maintenance — last 5 open/in-progress requests
    db.query(`
      SELECT
        mr.id,
        mr.title,
        mr.status,
        mr.priority,
        mr.category,
        mr.created_at,
        p.address_line1,
        un.unit_number
      FROM   maintenance_requests mr
      JOIN   units       un ON un.id = mr.unit_id
      JOIN   properties  p  ON p.id  = un.property_id
      WHERE  mr.status IN ('open', 'in_progress')
      ${ownerWhere}
      ORDER  BY mr.created_at DESC
      LIMIT  5
    `, p),
  ]);

  const { total_units, occupied_units } = occupancyResult.rows[0];
  const totalUnits    = parseInt(total_units,    10) || 0;
  const occupiedUnits = parseInt(occupied_units, 10) || 0;

  return {
    monthlyIncome:  parseFloat(incomeResult.rows[0].monthly_income),
    unpaidDues:     parseFloat(unpaidResult.rows[0].unpaid_dues),
    totalUnits,
    occupiedUnits,
    occupancyRate:  totalUnits > 0 ? occupiedUnits / totalUnits : 0,
    recentPayments:     paymentsResult.rows,
    recentMaintenance:  maintenanceResult.rows,
  };
}

module.exports = { getDashboardMetrics };
