const router = require('express').Router();
const { authenticate, authorize, requiresConnectOnboarded } = require('../middleware/auth');
const controller = require('../controllers/paymentController');
const {
  createPaymentValidators,
  createSetupIntentValidators,
  createPaymentIntentValidators,
  validate,
} = require('../middleware/validators');

// GET  /api/v1/payments?leaseId=xxx
router.get('/',    authenticate,                                                       controller.listPayments);
// POST records manual cash/check payments; Stripe payments come in via webhook
router.post('/',   authenticate, authorize('admin', 'landlord'), createPaymentValidators, validate, controller.createManualPayment);
router.get('/:id', authenticate,                                                       controller.getPayment);

// ── Stripe ACH ──────────────────────────────────────────────────────────────
// Step 1: obtain a SetupIntent client_secret so the tenant can add a bank account
router.post(
  '/stripe/setup-intent',
  authenticate, authorize('admin'),
  createSetupIntentValidators, validate,
  controller.createSetupIntent,
);

// Step 2: create a PaymentIntent to charge the verified bank account
// requiresConnectOnboarded: landlord must complete Stripe Connect before receiving ACH payouts
router.post(
  '/stripe/payment-intent',
  authenticate, authorize('admin'), requiresConnectOnboarded,
  createPaymentIntentValidators, validate,
  controller.createStripePaymentIntent,
);

// ── Tenant self-service ACH setup ────────────────────────────────────────────
// Tenant creates a SetupIntent to add their own bank account
router.post('/stripe/setup-intent/me',   authenticate, authorize('tenant'), controller.createMySetupIntent);
// Tenant lists their own saved bank accounts
router.get('/stripe/payment-methods/me', authenticate, authorize('tenant'), controller.listMyPaymentMethods);
// Tenant self-service payment — lease/charge resolved from JWT, not user-supplied
router.post('/stripe/payment-intent/me', authenticate, authorize('tenant'), controller.createMyPaymentIntent);

// ── Admin: list a tenant's saved payment methods ─────────────────────────────
router.get('/stripe/payment-methods/:tenantId', authenticate, authorize('admin'), controller.listPaymentMethods);

// ── Stripe Connect (landlord/admin payout setup) ──────────────────────────────
// POST: creates/retrieves a Connect Express account and returns a one-time onboarding URL
router.post('/connect/onboard', authenticate, authorize('admin', 'landlord'), controller.createConnectOnboardingLink);
// POST: returns a one-time login link to the Stripe Express Dashboard (already-onboarded only)
router.post('/connect/login',   authenticate, authorize('admin', 'landlord'), controller.createConnectLoginLink);
// GET:  returns the current onboarding status (connected, onboarded, chargesEnabled, etc.)
router.get('/connect/status',   authenticate, authorize('admin', 'landlord'), controller.getConnectStatus);

module.exports = router;
