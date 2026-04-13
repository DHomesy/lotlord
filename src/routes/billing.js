const { Router }               = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const controller               = require('../controllers/billingController');

const router = Router();

// ── Landlord self-service ─────────────────────────────────────────────────────
// GET  /billing/status   — current subscription status from DB
router.get( '/status',   authenticate, authorize('landlord'), controller.getMySubscription);
// POST /billing/checkout — initiate a new subscription via Stripe Checkout
router.post('/checkout', authenticate, authorize('landlord'), controller.createMyCheckoutSession);
// POST /billing/portal   — open Stripe Customer Portal to manage/cancel subscription
router.post('/portal',   authenticate, authorize('landlord'), controller.createMyBillingPortalSession);

// ── Admin ─────────────────────────────────────────────────────────────────────
// GET /billing/admin/landlords — list all landlords with their subscription status
router.get('/admin/landlords', authenticate, authorize('admin'), controller.listLandlordSubscriptions);

module.exports = router;
