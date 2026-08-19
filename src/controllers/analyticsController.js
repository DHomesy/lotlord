const analyticsRepo = require('../dal/analyticsRepository');
const { resolveOwnerId } = require('../lib/authHelpers');

/**
 * GET /api/v1/analytics/dashboard
 * Returns all key metrics for the dashboard.
 * - Admin: system-wide aggregate (no owner filter)
 * - Landlord/Employee: scoped to their own (or employer's) properties only
 */
async function getDashboard(req, res, next) {
  try {
    const ownerId = req.user.role === 'admin' ? null : resolveOwnerId(req.user);
    const data = await analyticsRepo.getDashboardMetrics(ownerId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/analytics/owner-qa-quality
 * Returns owner QA quality/fallback metrics.
 * - Admin: system-wide aggregate
 * - Landlord/Employee: owner-scoped aggregate
 */
async function getOwnerQaQuality(req, res, next) {
  try {
    const ownerId = req.user.role === 'admin' ? null : resolveOwnerId(req.user);
    const { days } = req.query;
    const data = await analyticsRepo.getOwnerQaQualityMetrics(ownerId, { days });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard, getOwnerQaQuality };
