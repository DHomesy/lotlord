const ledgerService = require('../services/ledgerService');
const ledgerRepo   = require('../dal/ledgerRepository');
const tenantRepo   = require('../dal/tenantRepository');

async function getLedger(req, res, next) {
  try {
    const { leaseId } = req.query;
    if (!leaseId) return res.status(400).json({ error: 'leaseId query param is required' });
    const data = await ledgerService.getLedger(leaseId);
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      if (!tenantRecord || tenantRecord.id !== data.lease.tenant_record_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (req.user.role === 'landlord') {
      if (data.lease.owner_id !== req.user.sub) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    res.json(data);
  } catch (err) { next(err); }
}

/**
 * GET /api/v1/ledger/portfolio
 *
 * Income summary across all properties (or one property), optionally filtered
 * to a date range.  Returns one row per property with a units[] breakdown.
 *
 * Query params (all optional):
 *   propertyId  — limit to a single property / building
 *   fromDate    — ISO date, e.g. 2026-01-01
 *   toDate      — ISO date, e.g. 2026-01-31
 *
 * Response shape per property:
 *   { propertyId, propertyName, address, unitCount,
 *     totalCharged, totalCollected, totalCredits,
 *     netIncome, outstanding, units[] }
 */
async function getPortfolioSummary(req, res, next) {
  try {
    const { propertyId, fromDate, toDate } = req.query;
    // Landlords are automatically scoped to properties they own
    const ownerId = req.user.role === 'landlord' ? req.user.sub : undefined;
    const summary = await ledgerRepo.getPortfolioIncomeSummary({
      propertyId: propertyId || undefined,
      fromDate:   fromDate   || undefined,
      toDate:     toDate     || undefined,
      ownerId,
    });
    res.json(summary);
  } catch (err) { next(err); }
}

module.exports = { getLedger, getPortfolioSummary };
