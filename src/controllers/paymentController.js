const ledgerService = require('../services/ledgerService');
const paymentRepo  = require('../dal/paymentRepository');
const tenantRepo   = require('../dal/tenantRepository');
const leaseRepo    = require('../dal/leaseRepository');
const ledgerRepo   = require('../dal/ledgerRepository');
const stripeService = require('../services/stripeService');

async function listPayments(req, res, next) {
  try {
    const { leaseId, page = 1, limit = 20 } = req.query;
    if (!leaseId) return res.status(400).json({ error: 'leaseId query param is required' });

    const lease = await leaseRepo.findById(leaseId);
    if (!lease) return res.status(404).json({ error: 'Lease not found' });
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      if (!tenantRecord || tenantRecord.id !== lease.tenant_record_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (req.user.role === 'landlord') {
      if (lease.owner_id !== req.user.sub) return res.status(403).json({ error: 'Forbidden' });
    }

    const payments = await paymentRepo.findByLeaseId(leaseId, { page: Number(page), limit: Number(limit) });
    res.json(payments);
  } catch (err) { next(err); }
}

async function getPayment(req, res, next) {
  try {
    const payment = await paymentRepo.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const lease = await leaseRepo.findById(payment.lease_id);
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      if (!tenantRecord || tenantRecord.id !== lease?.tenant_record_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (req.user.role === 'landlord') {
      if (!lease || lease.owner_id !== req.user.sub) return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(payment);
  } catch (err) { next(err); }
}

async function createManualPayment(req, res, next) {
  try {
    const { leaseId, amountPaid, paymentDate, paymentMethod, chargeId, notes } = req.body;
    if (req.user.role === 'landlord') {
      const lease = await leaseRepo.findById(leaseId);
      if (!lease || lease.owner_id !== req.user.sub) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    const result = await ledgerService.recordManualPayment(
      { leaseId, amountPaid, paymentDate, paymentMethod, chargeId, notes },
      req.user.sub,
    );
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function createSetupIntent(req, res, next) {
  try {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
    const result = await stripeService.createSetupIntent(tenantId);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function createStripePaymentIntent(req, res, next) {
  try {
    const { leaseId, chargeId, paymentMethodId } = req.body;
    const result = await stripeService.createPaymentIntent({
      leaseId,
      chargeId,
      paymentMethodId,
      createdBy: req.user.sub,
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

// ── Admin: list saved payment methods for a specific tenant ──────────────────
async function listPaymentMethods(req, res, next) {
  try {
    const methods = await stripeService.listPaymentMethods(req.params.tenantId);
    res.json(methods);
  } catch (err) { next(err); }
}

// ── Tenant self-service: create a SetupIntent for their own account ───────────
async function createMySetupIntent(req, res, next) {
  try {
    const tenant = await tenantRepo.findByUserId(req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant profile not found' });
    const result = await stripeService.createSetupIntent(tenant.id);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

// ── Tenant self-service: list their own saved payment methods ─────────────────
async function listMyPaymentMethods(req, res, next) {
  try {
    const tenant = await tenantRepo.findByUserId(req.user.sub);
    if (!tenant) return res.json([]);
    const methods = await stripeService.listPaymentMethods(tenant.id);
    res.json(methods);
  } catch (err) { next(err); }
}

// ── Tenant self-service: create a PaymentIntent to pay their own charge ────────
// Resolves the tenant + active lease from JWT; no user-supplied leaseId accepted.
async function createMyPaymentIntent(req, res, next) {
  try {
    const { chargeId, paymentMethodId } = req.body;
    if (!paymentMethodId) return res.status(400).json({ error: 'paymentMethodId is required' });

    // 1. Resolve tenant from JWT
    const tenant = await tenantRepo.findByUserId(req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant profile not found' });

    // 2. Find their active lease (server-resolved — tenant cannot supply their own leaseId)
    const leases = await leaseRepo.findAll({ tenantId: tenant.id, status: 'active' });
    const lease  = leases[0];
    if (!lease) return res.status(404).json({ error: 'No active lease found' });

    // 3. If chargeId provided, verify it belongs to this lease and is not already being paid
    if (chargeId) {
      const charge = await ledgerRepo.findChargeById(chargeId);
      if (!charge)                      return res.status(404).json({ error: 'Charge not found' });
      if (charge.lease_id !== lease.id) return res.status(403).json({ error: 'Charge does not belong to your lease' });
      if (charge.voided_at)             return res.status(400).json({ error: 'This charge has been voided' });

      // Prevent duplicate payments
      const pendingPay = await paymentRepo.findPendingByChargeId(chargeId);
      if (pendingPay) {
        return res.status(409).json({
          error: 'A payment is already in progress for this charge. Please wait for it to settle before retrying.',
        });
      }
      const completedPay = await paymentRepo.findCompletedByChargeId(chargeId);
      if (completedPay) {
        return res.status(409).json({ error: 'This charge has already been paid.' });
      }
    }

    const result = await stripeService.createPaymentIntent({
      leaseId:         lease.id,
      chargeId:        chargeId || null,
      paymentMethodId,
      createdBy:       req.user.sub,
      ipAddress:       req.ip,
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

// ── Stripe Connect (landlord payout setup) ───────────────────────────────────

async function createConnectOnboardingLink(req, res, next) {
  try {
    const result = await stripeService.createConnectOnboardingLink(req.user.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function createConnectLoginLink(req, res, next) {
  try {
    const result = await stripeService.createConnectLoginLink(req.user.sub);
    res.json(result);
  } catch (err) { next(err); }
}

async function getConnectStatus(req, res, next) {
  try {
    const status = await stripeService.getConnectStatus(req.user.sub);
    res.json(status);
  } catch (err) { next(err); }
}

module.exports = {
  listPayments,
  getPayment,
  createManualPayment,
  createSetupIntent,
  createStripePaymentIntent,
  listPaymentMethods,
  createMySetupIntent,
  listMyPaymentMethods,
  createMyPaymentIntent,
  createConnectOnboardingLink,
  createConnectLoginLink,
  getConnectStatus,
};
