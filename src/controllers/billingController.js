const stripeService = require('../services/stripeService');
const userRepo      = require('../dal/userRepository');

// GET /billing/status — landlord's own subscription status
async function getMySubscription(req, res, next) {
  try {
    const status = await stripeService.getSubscriptionStatus(req.user.sub);
    res.json(status);
  } catch (err) { next(err); }
}

// POST /billing/checkout — creates a Stripe Checkout session; client redirects to the returned URL
async function createMyCheckoutSession(req, res, next) {
  try {
    const plan = req.body?.plan === 'enterprise' ? 'enterprise' : 'starter';
    const result = await stripeService.createCheckoutSession(req.user.sub, plan);
    res.json(result);
  } catch (err) { next(err); }
}

// POST /billing/portal — creates a Stripe Customer Portal session for self-service billing management
async function createMyBillingPortalSession(req, res, next) {
  try {
    const result = await stripeService.createBillingPortalSession(req.user.sub);
    res.json(result);
  } catch (err) { next(err); }
}

// GET /billing/admin/landlords — admin view of all landlord subscription statuses
async function listLandlordSubscriptions(req, res, next) {
  try {
    const landlords = await userRepo.findAllLandlords();
    res.json(landlords);
  } catch (err) { next(err); }
}

module.exports = {
  getMySubscription,
  createMyCheckoutSession,
  createMyBillingPortalSession,
  listLandlordSubscriptions,
};
