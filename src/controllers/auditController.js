const auditService = require('../services/auditService');

/**
 * GET /api/v1/audit
 *
 * Query params (all optional):
 *   userId        — filter by actor
 *   resourceType  — e.g. 'payment', 'lease', 'charge'
 *   resourceId    — specific record UUID
 *   action        — prefix match (e.g. 'payment' matches 'payment_created', 'payment_received')
 *   startDate     — ISO datetime lower bound
 *   endDate       — ISO datetime upper bound
 *   page          — default 1
 *   limit         — default 50, max 200
 */
async function listEntries(req, res, next) {
  try {
    const { userId, resourceType, resourceId, action, startDate, endDate, page = 1, limit = 50 } = req.query;
    const entries = await auditService.getEntries({
      userId,
      resourceType,
      resourceId,
      action,
      startDate,
      endDate,
      page:  Number(page),
      limit: Math.min(Number(limit), 200),
    });
    res.json(entries);
  } catch (err) { next(err); }
}

module.exports = { listEntries };
