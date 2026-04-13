/**
 * Stripe integration
 * Prefer ACH (us_bank_account) for rent collection:
 *   - ACH: 0.8%, capped at $5 per transaction
 *   - Card: 2.9% + $0.30 (expensive on rent amounts)
 */

const Stripe = require('stripe');
const env = require('../config/env');

let stripe;

function getStripe() {
  if (!stripe) {
    stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  }
  return stripe;
}

/**
 * Create a PaymentIntent for ACH bank transfer.
 * @param {Object} opts
 * @param {number} opts.amountCents - Amount in cents (e.g. 150000 for $1,500)
 * @param {string} opts.customerId  - Stripe customer ID
 * @param {Object} opts.metadata    - Arbitrary metadata (e.g. { leaseId, tenantId })
 * @returns {Promise<import('stripe').Stripe.PaymentIntent>}
 */
async function createPaymentIntent({ amountCents, customerId, metadata }) {
  return getStripe().paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    customer: customerId,
    payment_method_types: ['us_bank_account'],
    metadata,
  });
}

/**
 * Verify the Stripe webhook signature.
 * Call this in the webhook route before processing any events.
 * @param {Buffer} rawBody  - Raw request body (requires express.raw() middleware)
 * @param {string} signature - Value of the stripe-signature header
 * @returns {import('stripe').Stripe.Event}
 */
function constructWebhookEvent(rawBody, signature) {
  return getStripe().webhooks.constructEvent(
    rawBody,
    signature,
    env.STRIPE_WEBHOOK_SECRET,
  );
}

module.exports = { createPaymentIntent, constructWebhookEvent, getStripe };
