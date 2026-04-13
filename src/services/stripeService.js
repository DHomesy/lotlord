/**
 * Stripe Service
 * --------------
 * Owns all Stripe business logic:
 *   - Customer management (one Stripe Customer per tenant)
 *   - SetupIntent  → tenant adds/verifies ACH bank account (one-time per bank account)
 *   - PaymentIntent → charge a verified bank account for rent
 *   - Webhook handler → reconcile payment events back to our ledger
 *
 * ACH vs Card costs at a glance:
 *   ACH (us_bank_account):  0.8%, capped at $5   ← use for rent
 *   Card:                   2.9% + $0.30          ← expensive on $1,500+ rent
 */

const { v4: uuidv4 } = require('uuid');
const { getStripe, constructWebhookEvent } = require('../integrations/stripe');
const tenantRepo  = require('../dal/tenantRepository');
const userRepo    = require('../dal/userRepository');
const paymentRepo = require('../dal/paymentRepository');
const ledgerRepo  = require('../dal/ledgerRepository');
const leaseRepo   = require('../dal/leaseRepository');
const { getClient } = require('../config/db');
const env             = require('../config/env');
const notificationService = require('./notificationService');
const audit           = require('./auditService');

// ── Customer ──────────────────────────────────────────────────────────────────

/**
 * Get or create a Stripe Customer for a tenant.
 * Persists the Stripe customer ID to tenants.stripe_customer_id on first creation.
 * Idempotent — safe to call on every PaymentIntent creation.
 *
 * @param {string} tenantId  - Our tenants.id UUID
 * @returns {Promise<import('stripe').Stripe.Customer>}
 */
async function getOrCreateStripeCustomer(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw Object.assign(new Error('Tenant not found'), { status: 404 });

  if (tenant.stripe_customer_id) {
    // Verify the customer still exists on Stripe's side (e.g. wasn't deleted in dashboard)
    try {
      const existing = await getStripe().customers.retrieve(tenant.stripe_customer_id);
      if (!existing.deleted) return existing;
    } catch {
      // Fall through and create a fresh one
    }
  }

  const customer = await getStripe().customers.create({
    email: tenant.email,
    name: `${tenant.first_name} ${tenant.last_name}`,
    metadata: { tenantId },
  });

  await tenantRepo.updateStripeCustomerId(tenantId, customer.id);
  return customer;
}

// ── SetupIntent ───────────────────────────────────────────────────────────────

/**
 * Create a SetupIntent so a tenant can add a bank account for ACH payments.
 *
 * Flow:
 *   1. Admin calls this endpoint on behalf of the tenant
 *   2. Frontend receives clientSecret and opens Stripe.js bank-account collection UI
 *   3. Tenant enters routing + account number → Stripe sends micro-deposits
 *   4. Tenant verifies micro-deposit amounts → PaymentMethod is confirmed and saved
 *   5. Subsequent PaymentIntents can reuse the saved paymentMethodId
 *
 * @param {string} tenantId
 * @returns {{ clientSecret: string, setupIntentId: string, customerId: string }}
 */
async function createSetupIntent(tenantId) {
  const customer = await getOrCreateStripeCustomer(tenantId);

  const setupIntent = await getStripe().setupIntents.create({
    customer: customer.id,
    payment_method_types: ['us_bank_account'],
    payment_method_options: {
      us_bank_account: {
        // financial_connections lets Stripe instantly verify some banks without micro-deposits
        financial_connections: { permissions: ['payment_method'] },
        verification_method: 'automatic',
      },
    },
  });

  return {
    clientSecret:   setupIntent.client_secret,
    setupIntentId:  setupIntent.id,
    customerId:     customer.id,
  };
}

// ── PaymentIntent ─────────────────────────────────────────────────────────────

/**
 * Create a Stripe PaymentIntent for a rent charge AND a pending rent_payment row.
 *
 * Flow:
 *   1. Call this to get a clientSecret
 *   2. Frontend confirms the PI with the tenant's saved paymentMethodId via Stripe.js
 *      OR pass paymentMethodId here to confirm server-side (returning tenants)
 *   3. Stripe sends a webhook → handleWebhookEvent() reconciles the ledger
 *
 * The ledger is NOT updated here — only on webhook confirmation.
 * This keeps the ledger as the source of truth for real completed transactions.
 *
 * @param {object} opts
 * @param {string}  opts.leaseId           - UUID of the lease
 * @param {string}  [opts.chargeId]        - UUID of a specific rent_charge (recommended)
 * @param {string}  [opts.paymentMethodId] - If provided, confirms immediately server-side
 * @param {string}  opts.createdBy         - User ID of the actor (admin recording the intent)
 * @returns {{ clientSecret, paymentIntentId, paymentId, amountDollars, status }}
 */
async function createPaymentIntent({ leaseId, chargeId, paymentMethodId, createdBy, ipAddress }) {
  const lease = await leaseRepo.findById(leaseId);
  if (!lease) throw Object.assign(new Error('Lease not found'), { status: 404 });

  // Determine charge amount — use linked charge if provided, else fall back to monthly rent
  let amountDollars = parseFloat(lease.monthly_rent);
  if (chargeId) {
    const charge = await ledgerRepo.findChargeById(chargeId);
    if (!charge) throw Object.assign(new Error('Charge not found'), { status: 404 });
    if (charge.lease_id !== leaseId) throw Object.assign(new Error('Charge does not belong to this lease'), { status: 400 });
    amountDollars = parseFloat(charge.amount);
  }
  const amountCents = Math.round(amountDollars * 100);

  // ── Resolve the landlord's Stripe Connect account ─────────────────────────────────
  // The lease query now includes p.owner_id — the landlord's users.id
  const landlordConnect = lease.owner_id
    ? await userRepo.findConnectStatus(lease.owner_id)
    : null;

  if (!landlordConnect?.stripe_account_id || !landlordConnect?.stripe_account_onboarded) {
    throw Object.assign(
      new Error('The landlord has not completed Stripe payout setup. Payments cannot be processed until they connect their bank account.'),
      { status: 422 },
    );
  }

  const customer = await getOrCreateStripeCustomer(lease.tenant_record_id);

  const intentParams = {
    amount:               amountCents,
    currency:             'usd',
    customer:             customer.id,
    payment_method_types: ['us_bank_account'],
    description:          `Rent — ${lease.property_name} Unit ${lease.unit_number}`,
    // Route funds directly to the landlord's bank via their Connect Express account.
    // on_behalf_of is intentionally omitted — it requires card_payments capability and is
    // not needed for ACH (us_bank_account). transfer_data.destination alone is sufficient.
    transfer_data: { destination: landlordConnect.stripe_account_id },
    metadata: {
      leaseId,
      chargeId:          chargeId  || '',
      createdBy:         createdBy || '',
      tenantName:        `${lease.first_name} ${lease.last_name}`,
      landlordAccountId: landlordConnect.stripe_account_id,
    },
  };

  // If the tenant already has a saved payment method, confirm immediately
  if (paymentMethodId) {
    intentParams.payment_method = paymentMethodId;
    intentParams.confirm        = true;
    intentParams.mandate_data   = {
      customer_acceptance: {
        type:   'online',
        online: {
          ip_address: ipAddress || '127.0.0.1',
          user_agent: 'server',
        },
      },
    };
  }

  const intent = await getStripe().paymentIntents.create(intentParams);

  // Persist a pending payment record — we reconcile the final status via webhook
  const paymentId = uuidv4();
  const client    = await getClient();
  try {
    await client.query('BEGIN');
    await paymentRepo.create(client, {
      id:                    paymentId,
      leaseId,
      chargeId:              chargeId || null,
      amountPaid:            amountDollars,
      paymentDate:           new Date().toISOString().split('T')[0],
      paymentMethod:         'stripe_ach',
      stripePaymentIntentId: intent.id,
      status:                'pending',
      notes:                 null,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // Cancel the Stripe intent to avoid an orphaned charge with no DB record
    await getStripe().paymentIntents.cancel(intent.id).catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Fire-and-forget audit entry (no IP available in service layer)
  audit.log({
    action:       'payment_initiated',
    resourceType: 'payment',
    resourceId:   paymentId,
    userId:       createdBy || null,
    metadata:     { leaseId, chargeId, amountDollars, paymentIntentId: intent.id, status: intent.status },
  });

  return {
    clientSecret:    intent.client_secret,
    paymentIntentId: intent.id,
    paymentId,
    amountDollars,
    status:          intent.status,
  };
}

// ── Webhook ───────────────────────────────────────────────────────────────────

/**
 * Verify and process a Stripe webhook event.
 * Must be called with the raw request body buffer — NOT the parsed JSON body.
 * (app.js already applies express.raw() to this route.)
 *
 * Handled events:
 *   payment_intent.succeeded       → mark completed, append ledger entry, send receipt email
 *   payment_intent.payment_failed  → mark failed
 *   payment_intent.canceled        → mark failed
 *
 * All other events are acknowledged (200) without processing.
 *
 * @param {Buffer} rawBody
 * @param {string} signature  - stripe-signature header value
 * @returns {Promise<import('stripe').Stripe.Event>}
 */
async function handleWebhookEvent(rawBody, signature) {
  // This throws if the signature is invalid — the route should return 400 in that case
  const event = constructWebhookEvent(rawBody, signature);

  switch (event.type) {
    case 'payment_intent.succeeded':
      await onPaymentSucceeded(event.data.object);
      break;
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled':
      await onPaymentFailed(event.data.object);
      break;
    // ── Stripe Connect events ──────────────────────────────────────────────
    case 'account.updated':
      await onConnectAccountUpdated(event.data.object);
      break;
    case 'account.application.deauthorized':
      // event.account holds the Connect account ID (not event.data.object)
      await onConnectAccountDeauthorized(event.account);
      break;
    case 'payout.paid':
      console.info(`[stripe connect] payout.paid — account ${event.account}, amount ${event.data.object.amount}`);
      break;
    case 'payout.failed':
      console.warn(`[stripe connect] payout.failed — account ${event.account}:`, event.data.object.failure_message);
      break;
    // ── Subscription billing events ────────────────────────────────────────
    case 'checkout.session.completed': {
      // When the landlord completes Stripe Checkout, immediately mark the
      // subscription active using the embedded subscription object.
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        const subscription = await getStripe().subscriptions.retrieve(session.subscription);
        await onSubscriptionUpdated(subscription);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await onSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(event.data.object);
      break;
    case 'invoice.paid':
      await onInvoicePaid(event.data.object);
      break;
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      if (invoice.subscription) {
        const user = await userRepo.findByStripeBillingCustomerId(invoice.customer);
        if (user) await userRepo.updateBillingStatus(user.id, { subscriptionStatus: 'past_due' });
      }
      break;
    }
    default:
      // Acknowledge without processing
      break;
  }

  return event;
}

// ── Private webhook handlers ──────────────────────────────────────────────────

async function onPaymentSucceeded(paymentIntent) {
  const payment = await paymentRepo.findByStripePaymentIntentId(paymentIntent.id);
  if (!payment) {
    console.warn(`[stripe] payment_intent.succeeded — no DB record for intent ${paymentIntent.id}`);
    return;
  }
  // Idempotent — Stripe can deliver the same event more than once
  if (payment.status === 'completed') return;

  const amountPaid = parseFloat(payment.amount_paid);
  const client     = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Mark the payment completed
    await paymentRepo.updateStatus(payment.id, 'completed', client);

    // 2. Append a payment entry to the immutable ledger
    const currentBalance = await ledgerRepo.getCurrentBalance(payment.lease_id);
    const balanceAfter   = parseFloat((currentBalance - amountPaid).toFixed(2));

    await ledgerRepo.appendEntry(client, {
      id:          uuidv4(),
      leaseId:     payment.lease_id,
      entryType:   'payment',
      amount:      -amountPaid,           // negative = money received
      balanceAfter,
      description: `Stripe ACH payment — ${paymentIntent.id}`,
      referenceId: payment.id,
      createdBy:   null,                  // system-initiated via webhook
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // Re-throw so the webhook route returns 500 and Stripe retries
    throw err;
  } finally {
    client.release();
  }

  // Non-fatal: send payment receipt email
  try {
    const lease = await leaseRepo.findById(payment.lease_id);
    if (lease?.user_id) {
      await notificationService.sendByTriggerEvent({
        triggerEvent: 'payment_received',
        recipientId:  lease.user_id,
        variables: {
          first_name:  lease.first_name,
          tenant_name: `${lease.first_name} ${lease.last_name}`,
          amount:      `$${amountPaid.toFixed(2)}`,
          unit:        lease.unit_number,
          property:    lease.property_name,
        },
      });
    }
  } catch (notifErr) {
    console.error('[stripe] payment_received notification failed:', notifErr.message);
  }

  // Audit log
  audit.log({
    action: 'payment_succeeded',
    resourceType: 'payment',
    resourceId: payment.id,
    userId: null, // webhook — no acting user
    metadata: { leaseId: payment.lease_id, chargeId: payment.charge_id, amountPaid, paymentIntentId: paymentIntent.id },
  });
}

async function onPaymentFailed(paymentIntent) {
  const payment = await paymentRepo.findByStripePaymentIntentId(paymentIntent.id);
  if (!payment || payment.status !== 'pending') return;
  await paymentRepo.updateStatus(payment.id, 'failed');
  console.log(`[stripe] Payment ${payment.id} marked failed — intent ${paymentIntent.id}`);
  audit.log({
    action: 'payment_failed',
    resourceType: 'payment',
    resourceId: payment.id,
    userId: null,
    metadata: { leaseId: payment.lease_id, chargeId: payment.charge_id, paymentIntentId: paymentIntent.id },
  });
}

// ── Payment Methods ───────────────────────────────────────────────────────────

/**
 * List the saved ACH bank accounts (us_bank_account PaymentMethods) for a tenant.
 * @param {string} tenantId
 * @returns {Promise<Array<{ id, bankName, last4, accountType }>>}
 */
async function listPaymentMethods(tenantId) {
  const customer = await getOrCreateStripeCustomer(tenantId);
  const { data } = await getStripe().paymentMethods.list({
    customer: customer.id,
    type: 'us_bank_account',
  });
  return data.map((pm) => ({
    id:          pm.id,
    bankName:    pm.us_bank_account?.bank_name    ?? 'Bank',
    last4:       pm.us_bank_account?.last4        ?? '????',
    accountType: pm.us_bank_account?.account_type ?? 'checking',
  }));
}

// ── Stripe Connect ─────────────────────────────────────────────────────────

/**
 * Get or create a Stripe Connect Express account for a landlord/admin.
 * Persists the account ID to users.stripe_account_id on first creation.
 * Idempotent — safe to call on every onboarding link request.
 */
async function getOrCreateConnectAccount(userId) {
  const user = await userRepo.findById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const existing = await userRepo.findConnectStatus(userId);
  if (existing?.stripe_account_id) return existing.stripe_account_id;

  const account = await getStripe().accounts.create({
    type: 'express',
    country: 'US',
    email: user.email,
    capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    metadata: { userId },
  });

  await userRepo.updateStripeConnect(userId, { accountId: account.id, onboarded: false });
  return account.id;
}

/**
 * Generate a one-time Stripe Connect onboarding URL for the given user.
 * The URL expires after a short window — generate fresh on each click.
 */
async function createConnectOnboardingLink(userId) {
  const accountId = await getOrCreateConnectAccount(userId);
  const link = await getStripe().accountLinks.create({
    account:     accountId,
    return_url:  `${env.FRONTEND_URL}/profile?connect=success`,
    refresh_url: `${env.FRONTEND_URL}/profile?connect=refresh`,
    type:        'account_onboarding',
  });
  return { url: link.url, accountId };
}

/**
 * Generate a one-time Stripe Express Dashboard login link for an already-onboarded landlord.
 * Redirects them to Stripe's hosted dashboard where they can manage bank details, payouts, etc.
 */
async function createConnectLoginLink(userId) {
  const row = await userRepo.findConnectStatus(userId);
  if (!row?.stripe_account_id) throw Object.assign(new Error('No connected Stripe account'), { status: 400 });
  if (!row.stripe_account_onboarded) throw Object.assign(new Error('Stripe account onboarding is not complete'), { status: 400 });
  const link = await getStripe().accounts.createLoginLink(row.stripe_account_id);
  return { url: link.url };
}

/**
 * Return the current Stripe Connect status for a user.
 * Syncs our DB if Stripe reports onboarding is now complete.
 */
async function getConnectStatus(userId) {
  const row = await userRepo.findConnectStatus(userId);
  if (!row?.stripe_account_id) return { connected: false, onboarded: false };

  let account;
  try {
    account = await getStripe().accounts.retrieve(row.stripe_account_id);
  } catch {
    // Account deleted on Stripe — clear our record
    await userRepo.updateStripeConnect(userId, { accountId: null, onboarded: false });
    return { connected: false, onboarded: false };
  }

  const onboarded = !!(account.charges_enabled && account.details_submitted);
  if (onboarded && !row.stripe_account_onboarded) {
    await userRepo.updateStripeConnect(userId, { accountId: row.stripe_account_id, onboarded: true });
  }

  return {
    connected:        true,
    onboarded,
    accountId:        row.stripe_account_id,
    chargesEnabled:   account.charges_enabled,
    detailsSubmitted: account.details_submitted,
    payoutsEnabled:   account.payouts_enabled,
  };
}

// ── Private Connect webhook handlers ─────────────────────────────────────────

async function onConnectAccountUpdated(account) {
  if (!account.charges_enabled || !account.details_submitted) return;
  const user = await userRepo.findByStripeAccountId(account.id);
  if (!user) {
    console.warn(`[stripe connect] account.updated — no user for account ${account.id}`);
    return;
  }
  if (user.stripe_account_onboarded) return; // idempotent
  await userRepo.updateStripeConnect(user.id, { accountId: account.id, onboarded: true });
  console.info(`[stripe connect] Landlord ${user.id} (${user.email}) onboarding complete`);
}

async function onConnectAccountDeauthorized(stripeAccountId) {
  const user = await userRepo.findByStripeAccountId(stripeAccountId);
  if (!user) return;
  await userRepo.updateStripeConnect(user.id, { accountId: null, onboarded: false });
  console.info(`[stripe connect] Landlord ${user.id} (${user.email}) disconnected Stripe account`);
}

// ── SaaS Billing (Landlord Subscriptions) ────────────────────────────────────

async function getOrCreateBillingCustomer(userId) {
  const user    = await userRepo.findById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const billing = await userRepo.findBillingStatus(userId);
  if (billing?.stripe_billing_customer_id) {
    try {
      const existing = await getStripe().customers.retrieve(billing.stripe_billing_customer_id);
      if (!existing.deleted) return existing;
    } catch { /* fall through — recreate */ }
  }

  const customer = await getStripe().customers.create({
    email:    user.email,
    name:     `${user.first_name} ${user.last_name}`,
    metadata: { userId, role: user.role },
  });

  await userRepo.updateBillingStatus(userId, { billingCustomerId: customer.id });
  return customer;
}

async function createCheckoutSession(userId) {
  if (!env.STRIPE_PRICE_ID) {
    throw Object.assign(
      new Error('STRIPE_PRICE_ID is not configured. Create a Product + Price in the Stripe Dashboard, then add STRIPE_PRICE_ID to your .env.'),
      { status: 500 },
    );
  }
  const customer = await getOrCreateBillingCustomer(userId);
  const session  = await getStripe().checkout.sessions.create({
    mode:       'subscription',
    customer:   customer.id,
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${env.FRONTEND_URL}/profile?billing=success`,
    cancel_url:  `${env.FRONTEND_URL}/profile?billing=canceled`,
    metadata:    { userId },
  });
  return { url: session.url, sessionId: session.id };
}

async function createBillingPortalSession(userId) {
  const billing = await userRepo.findBillingStatus(userId);
  if (!billing?.stripe_billing_customer_id) {
    throw Object.assign(
      new Error('No billing account found. Please subscribe first.'),
      { status: 400 },
    );
  }
  const session = await getStripe().billingPortal.sessions.create({
    customer:   billing.stripe_billing_customer_id,
    return_url: `${env.FRONTEND_URL}/profile`,
  });
  return { url: session.url };
}

async function getSubscriptionStatus(userId) {
  const billing = await userRepo.findBillingStatus(userId);
  return {
    status:     billing?.subscription_status          ?? 'none',
    plan:       billing?.subscription_plan            ?? null,
    customerId: billing?.stripe_billing_customer_id   ?? null,
  };
}

// ── Private billing webhook handlers ─────────────────────────────────────────

async function onSubscriptionUpdated(subscription) {
  const user = await userRepo.findByStripeBillingCustomerId(subscription.customer);
  if (!user) {
    console.warn(`[stripe billing] subscription event — no user for customer ${subscription.customer}`);
    return;
  }
  await userRepo.updateBillingStatus(user.id, {
    subscriptionId:     subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionPlan:   subscription.items?.data?.[0]?.price?.nickname
                     || subscription.items?.data?.[0]?.price?.id
                     || null,
  });
  console.info(`[stripe billing] Subscription "${subscription.status}" for user ${user.id} (${user.email})`);
}

async function onSubscriptionDeleted(subscription) {
  const user = await userRepo.findByStripeBillingCustomerId(subscription.customer);
  if (!user) return;
  await userRepo.updateBillingStatus(user.id, {
    subscriptionStatus: 'canceled',
    subscriptionId:     null,
  });
  console.info(`[stripe billing] Subscription canceled for user ${user.id} (${user.email})`);
}

async function onInvoicePaid(invoice) {
  if (!invoice.subscription) return; // not a subscription invoice
  const user = await userRepo.findByStripeBillingCustomerId(invoice.customer);
  if (!user) return;
  await userRepo.updateBillingStatus(user.id, { subscriptionStatus: 'active' });
}

module.exports = {
  getOrCreateStripeCustomer,
  createSetupIntent,
  createPaymentIntent,
  listPaymentMethods,
  handleWebhookEvent,
  createConnectOnboardingLink,
  createConnectLoginLink,
  getConnectStatus,
  createCheckoutSession,
  createBillingPortalSession,
  getSubscriptionStatus,
};
