const analyticsRepo = require('../dal/analyticsRepository');

/**
 * GET /api/v1/analytics/dashboard
 * Returns all key metrics for the dashboard.
 * - Admin: system-wide aggregate (no owner filter)
 * - Landlord: scoped to their own properties only
 */
async function getDashboard(req, res, next) {
  try {
    const ownerId = req.user.role === 'landlord' ? req.user.sub : null;
    const data = await analyticsRepo.getDashboardMetrics(ownerId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard };
