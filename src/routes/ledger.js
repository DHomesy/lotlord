const router = require('express').Router();
const { authenticate, authorize, requiresStarter } = require('../middleware/auth');
const controller = require('../controllers/ledgerController');

// GET /api/v1/ledger/portfolio  — income summary across all properties
// Admins see everything; landlords are automatically scoped to their own properties.
// requiresStarter: portfolio-level reporting requires a Starter or Enterprise plan
// ?propertyId=xxx&fromDate=2026-01-01&toDate=2026-01-31
router.get('/portfolio', authenticate, authorize('admin', 'landlord'), requiresStarter, controller.getPortfolioSummary);

// GET /api/v1/ledger?leaseId=xxx  — full append-only audit trail for one lease
router.get('/', authenticate, controller.getLedger);

module.exports = router;
