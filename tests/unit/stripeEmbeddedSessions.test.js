jest.mock('../../src/integrations/stripe', () => ({
  getStripe: jest.fn(),
  constructWebhookEvent: jest.fn(),
}));
jest.mock('../../src/dal/tenantRepository', () => ({}));
jest.mock('../../src/dal/userRepository', () => ({
  findById: jest.fn(),
  findBillingStatus: jest.fn(),
  findConnectStatus: jest.fn(),
  updateBillingStatus: jest.fn(),
  updateStripeConnect: jest.fn(),
}));
jest.mock('../../src/dal/paymentRepository', () => ({}));
jest.mock('../../src/dal/ledgerRepository', () => ({}));
jest.mock('../../src/dal/leaseRepository', () => ({}));
jest.mock('../../src/config/db', () => ({ getClient: jest.fn(), query: jest.fn() }));
jest.mock('../../src/services/notificationService', () => ({ sendByTriggerEvent: jest.fn() }));
jest.mock('../../src/services/auditService', () => ({ log: jest.fn() }));

const { getStripe } = require('../../src/integrations/stripe');
const userRepo = require('../../src/dal/userRepository');
const env = require('../../src/config/env');
const stripeService = require('../../src/services/stripeService');

const stripe = {
  accountSessions: { create: jest.fn() },
  accounts: { create: jest.fn() },
  checkout: { sessions: { create: jest.fn() } },
  customers: { create: jest.fn(), retrieve: jest.fn(), update: jest.fn() },
  paymentMethods: { retrieve: jest.fn(), detach: jest.fn() },
  setupIntents: { create: jest.fn(), retrieve: jest.fn(), list: jest.fn(), verifyMicrodeposits: jest.fn() },
  subscriptions: { retrieve: jest.fn(), update: jest.fn() },
};

beforeEach(() => {
  jest.clearAllMocks();
  getStripe.mockReturnValue(stripe);
  env.STRIPE_PRICE_ID_STARTER = 'price_paid_monthly';
  env.FRONTEND_URL = 'https://lotlord.app';
});

describe('createEmbeddedCheckoutSession', () => {
  test('creates an embedded subscription session for the existing billing customer', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      first_name: 'Property',
      last_name: 'Owner',
      role: 'landlord',
    });
    userRepo.findBillingStatus.mockResolvedValue({ stripe_billing_customer_id: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({ id: 'cus_existing', deleted: false });
    stripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_embedded',
      client_secret: 'cs_secret_test',
    });

    await expect(stripeService.createEmbeddedCheckoutSession('user-1')).resolves.toEqual({
      clientSecret: 'cs_secret_test',
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
      mode: 'subscription',
      ui_mode: 'embedded',
      customer: 'cus_existing',
      line_items: [{ price: 'price_paid_monthly', quantity: 1 }],
      return_url: 'https://lotlord.app/payments?checkout=return&session_id={CHECKOUT_SESSION_ID}',
      metadata: { userId: 'user-1', requestedPlan: 'starter' },
    });
  });
});

describe('createConnectAccountSession', () => {
  test('requests Stripe-supported payment and transfer capabilities for a new Express account', async () => {
    userRepo.findById.mockResolvedValue({ id: 'user-1', email: 'owner@example.com' });
    userRepo.findConnectStatus.mockResolvedValue({ stripe_account_id: null });
    stripe.accounts.create.mockResolvedValue({ id: 'acct_new' });
    stripe.accountSessions.create.mockResolvedValue({ client_secret: 'acct_session_secret' });

    await stripeService.createConnectAccountSession('user-1');

    expect(stripe.accounts.create).toHaveBeenCalledWith({
      type: 'express',
      country: 'US',
      email: 'owner@example.com',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { userId: 'user-1' },
    });
    expect(userRepo.updateStripeConnect).toHaveBeenCalledWith('user-1', {
      accountId: 'acct_new',
      onboarded: false,
    });
  });

  test('scopes embedded payout components to the landlord connected account', async () => {
    userRepo.findById.mockResolvedValue({ id: 'user-1' });
    userRepo.findConnectStatus.mockResolvedValue({ stripe_account_id: 'acct_existing' });
    stripe.accountSessions.create.mockResolvedValue({ client_secret: 'acct_session_secret' });

    await expect(stripeService.createConnectAccountSession('user-1')).resolves.toEqual({
      clientSecret: 'acct_session_secret',
    });
    expect(stripe.accountSessions.create).toHaveBeenCalledWith({
      account: 'acct_existing',
      components: {
        account_onboarding: { enabled: true },
        account_management: { enabled: true },
        notification_banner: { enabled: true },
        balances: { enabled: true },
        payouts: { enabled: true },
      },
    });
  });
});

describe('subscription self-service', () => {
  test('creates an off-session card SetupIntent for the billing customer', async () => {
    userRepo.findById.mockResolvedValue({ id: 'user-1', email: 'owner@example.com', first_name: 'Property', last_name: 'Owner', role: 'landlord' });
    userRepo.findBillingStatus.mockResolvedValue({ stripe_billing_customer_id: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({ id: 'cus_existing', deleted: false });
    stripe.setupIntents.create.mockResolvedValue({ id: 'seti_card', client_secret: 'seti_secret' });

    await expect(stripeService.createBillingSetupIntent('user-1')).resolves.toEqual({
      clientSecret: 'seti_secret',
      setupIntentId: 'seti_card',
    });
    expect(stripe.setupIntents.create).toHaveBeenCalledWith({
      customer: 'cus_existing',
      usage: 'off_session',
      payment_method_types: ['card'],
      metadata: { userId: 'user-1', purpose: 'subscription_billing' },
    });
  });

  test('sets a completed SetupIntent card as the customer and subscription default', async () => {
    userRepo.findBillingStatus.mockResolvedValue({
      stripe_billing_customer_id: 'cus_existing',
      subscription_id: 'sub_existing',
    });
    stripe.setupIntents.retrieve.mockResolvedValue({
      id: 'seti_card',
      status: 'succeeded',
      customer: 'cus_existing',
      payment_method: 'pm_card',
      metadata: { userId: 'user-1', purpose: 'subscription_billing' },
    });
    stripe.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_card',
      type: 'card',
      card: { brand: 'visa', last4: '4242', exp_month: 8, exp_year: 2030 },
    });

    await expect(stripeService.setBillingPaymentMethod('user-1', 'seti_card')).resolves.toEqual({
      paymentMethod: { id: 'pm_card', type: 'card', brand: 'visa', last4: '4242', expiresMonth: 8, expiresYear: 2030 },
    });
    expect(stripe.customers.update).toHaveBeenCalledWith('cus_existing', {
      invoice_settings: { default_payment_method: 'pm_card' },
    });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_existing', {
      default_payment_method: 'pm_card',
    });
  });

  test('schedules cancellation at period end without immediately deleting access', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_id: 'sub_existing' });
    stripe.subscriptions.update.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: 1893456000,
    });

    const result = await stripeService.setSubscriptionCancellation('user-1', true);
    expect(result).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_existing', { cancel_at_period_end: true });
  });
});

describe('tenant bank self-service', () => {
  test('verifies pending microdeposits for the tenant-owned SetupIntent', async () => {
    stripe.customers.create.mockResolvedValue({ id: 'cus_tenant' });
    stripe.setupIntents.list.mockResolvedValue({
      data: [{ id: 'seti_bank', payment_method: 'pm_bank', status: 'requires_action' }],
    });
    stripe.setupIntents.verifyMicrodeposits.mockResolvedValue({ status: 'succeeded' });
    const tenantRepo = require('../../src/dal/tenantRepository');
    tenantRepo.findById = jest.fn().mockResolvedValue({ id: 'tenant-1', email: 'tenant@example.com', first_name: 'Ten', last_name: 'Ant' });
    tenantRepo.updateStripeCustomerId = jest.fn();

    await expect(stripeService.verifyPaymentMethodMicrodeposits('tenant-1', 'pm_bank', [32, 45])).resolves.toEqual({
      verified: true,
      status: 'succeeded',
    });
    expect(stripe.setupIntents.verifyMicrodeposits).toHaveBeenCalledWith('seti_bank', { amounts: [32, 45] });
  });

  test('does not detach a payment method owned by another customer', async () => {
    stripe.customers.create.mockResolvedValue({ id: 'cus_tenant' });
    stripe.paymentMethods.retrieve.mockResolvedValue({ id: 'pm_foreign', customer: 'cus_other' });
    const tenantRepo = require('../../src/dal/tenantRepository');
    tenantRepo.findById = jest.fn().mockResolvedValue({ id: 'tenant-1', email: 'tenant@example.com', first_name: 'Ten', last_name: 'Ant' });
    tenantRepo.updateStripeCustomerId = jest.fn();

    await expect(stripeService.removePaymentMethod('tenant-1', 'pm_foreign')).rejects.toMatchObject({ status: 404 });
    expect(stripe.paymentMethods.detach).not.toHaveBeenCalled();
  });
});