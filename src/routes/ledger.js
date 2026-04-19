const router = require('express').Router();
const { authenticate, authorize, requiresStarter } = require('../middleware/auth');
const controller = require('../controllers/ledgerController');

// GET /api/v1/ledger/portfolio  — income summary across all properties
// Admins see everything; landlords and employees are automatically scoped to their own properties.
// requiresStarter: portfolio-level reporting requires a Starter or Enterprise plan
// ?propertyId=xxx&fromDate=2026-01-01&toDate=2026-01-31
router.get('/portfolio', authenticate, authorize('admin', 'landlord', 'employee'), requiresStarter, controller.getPortfolioSummary);

// GET /api/v1/ledger/statement?leaseId=xxx[&from=YYYY-MM-DD][&to=YYYY-MM-DD]
// Returns filtered ledger entries for a lease — for tenant account statements.
router.get('/statement', authenticate, controller.getStatement);

// GET /api/v1/ledger/statement/pdf?leaseId=xxx[&from=YYYY-MM-DD][&to=YYYY-MM-DD]
// Streams a PDF account statement — official accounting record for legal/audit use.
router.get('/statement/pdf', authenticate, controller.getStatementPdf);

// GET /api/v1/ledger?leaseId=xxx  — full append-only audit trail for one lease
router.get('/', authenticate, controller.getLedger);

module.exports = router;
