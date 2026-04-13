const router = require('express').Router();
const { authenticate, authorize, requiresPro } = require('../middleware/auth');
const controller = require('../controllers/ledgerController');

// GET /api/v1/ledger/portfolio  — income summary across all properties
// Admins see everything; landlords are automatically scoped to their own properties.
// requiresPro: portfolio-level reporting is a Pro feature
// ?propertyId=xxx&fromDate=2026-01-01&toDate=2026-01-31
router.get('/portfolio', authenticate, authorize('admin', 'landlord'), requiresPro, controller.getPortfolioSummary);

// GET /api/v1/ledger?leaseId=xxx  — full append-only audit trail for one lease
router.get('/', authenticate, controller.getLedger);

module.exports = router;
