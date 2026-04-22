const ledgerService = require('../services/ledgerService');
const paymentRepo  = require('../dal/paymentRepository');
const tenantRepo   = require('../dal/tenantRepository');
const leaseRepo    = require('../dal/leaseRepository');
const ledgerRepo   = require('../dal/ledgerRepository');
const stripeService = require('../services/stripeService');
const PDFDocument   = require('pdfkit');
const { resolveOwnerId } = require('../lib/authHelpers');

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
    } else if (req.user.role === 'landlord' || req.user.role === 'employee') {
      if (lease.owner_id !== resolveOwnerId(req.user)) return res.status(403).json({ error: 'Forbidden' });
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
    } else if (req.user.role === 'landlord' || req.user.role === 'employee') {
      if (!lease || lease.owner_id !== resolveOwnerId(req.user)) return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(payment);
  } catch (err) { next(err); }
}

async function createManualPayment(req, res, next) {
  try {
    const { leaseId, amountPaid, paymentDate, paymentMethod, chargeId, notes } = req.body;
    if (req.user.role === 'landlord' || req.user.role === 'employee') {
      const lease = await leaseRepo.findById(leaseId);
      if (!lease || lease.owner_id !== resolveOwnerId(req.user)) {
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
      userAgent: req.get('user-agent'),
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
    const { chargeId, paymentMethodId, amount } = req.body;
    if (!paymentMethodId) return res.status(400).json({ error: 'paymentMethodId is required' });

    // 1. Resolve tenant from JWT
    const tenant = await tenantRepo.findByUserId(req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant profile not found' });

    // 2. Find their active lease (server-resolved — tenant cannot supply their own leaseId)
    const leases = await leaseRepo.findAll({ tenantId: tenant.id, status: 'active' });
    const lease  = leases[0];
    if (!lease) return res.status(404).json({ error: 'No active lease found' });

    // 3. If chargeId provided, verify it belongs to this lease and is not already fully paid
    let charge = null;
    let chargeTotalPaid = 0;
    if (chargeId) {
      charge = await ledgerRepo.findChargeById(chargeId);
      if (!charge)                        return res.status(404).json({ error: 'Charge not found' });
      if (charge.lease_id !== lease.id)   return res.status(403).json({ error: 'Charge does not belong to your lease' });
      if (charge.voided_at)               return res.status(400).json({ error: 'This charge has been voided' });

      // Prevent duplicate in-flight payments
      const pendingPay = await paymentRepo.findPendingByChargeId(chargeId);
      if (pendingPay) {
        return res.status(409).json({
          error: 'A payment is already in progress for this charge. Please wait for it to settle before retrying.',
        });
      }
      // Prevent re-paying a fully settled charge
      chargeTotalPaid = await paymentRepo.getTotalPaidForCharge(chargeId);
      if (chargeTotalPaid >= parseFloat(charge.amount)) {
        return res.status(409).json({ error: 'This charge has already been paid in full.' });
      }
    }

    // 4. Validate optional partial amount
    let resolvedAmount = null;
    if (amount != null) {
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }
      if (charge) {
        // Cap at remaining balance — prevents overpaying a partially-paid charge
        const remaining = parseFloat(charge.amount) - chargeTotalPaid;
        if (parsed > remaining) {
          return res.status(400).json({ error: 'amount cannot exceed the remaining balance on this charge' });
        }
      }
      // Safety cap when no specific charge is linked — prevent arbitrary large ACH debits
      if (!charge && parsed > parseFloat(lease.monthly_rent)) {
        return res.status(400).json({ error: 'amount cannot exceed monthly rent when no charge is specified' });
      }
      resolvedAmount = parsed;
    }

    const result = await stripeService.createPaymentIntent({
      leaseId:         lease.id,
      chargeId:        chargeId || null,
      paymentMethodId,
      amount:          resolvedAmount,
      createdBy:       req.user.sub,
      ipAddress:       req.ip,
      userAgent:       req.get('user-agent'),
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

/**
 * GET /payments/:id/receipt
 * Streams a PDF receipt for the given payment.
 * - Tenant: may download their own payments
 * - Landlord/employee: may download payments scoped to their properties
 * - Admin: unrestricted
 */
async function getReceipt(req, res, next) {
  try {
    const payment = await paymentRepo.findForReceipt(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    // Access control
    if (req.user.role === 'tenant') {
      const tenantRecord = await tenantRepo.findByUserId(req.user.sub);
      const lease = await leaseRepo.findById(payment.lease_id);
      if (!tenantRecord || tenantRecord.id !== lease?.tenant_record_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (req.user.role === 'landlord' || req.user.role === 'employee') {
      if (payment.owner_id !== resolveOwnerId(req.user)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const tenantName = [payment.tenant_first_name, payment.tenant_last_name].filter(Boolean).join(' ') || payment.tenant_email;
    const landlordName = [payment.landlord_first_name, payment.landlord_last_name].filter(Boolean).join(' ') || 'LotLord';
    const formattedAmount = `$${Number(payment.amount_paid).toFixed(2)}`;
    const formattedDate = new Date(payment.payment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const method = (payment.payment_method || 'payment').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const doc = new PDFDocument({ size: 'LETTER', margin: 60 });

    doc.on('error', (err) => {
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to generate PDF' });
      }
      res.end();
      console.error('[getReceipt] pdfkit error after pipe:', err.message);
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.id}.pdf"`);
    doc.pipe(res);

    // Header
    doc.font('Helvetica-Bold').fontSize(24).text('LotLord', 60, 60);
    doc.font('Helvetica').fontSize(11).fillColor('#555').text('Property Management Platform', 60, 89);
    doc.moveTo(60, 110).lineTo(555, 110).lineWidth(1).strokeColor('#ddd').stroke();

    // Title
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(18).text('PAYMENT RECEIPT', 60, 125);
    doc.font('Helvetica').fontSize(11).fillColor('#555').text(`Receipt for payment ID: ${payment.id}`, 60, 148);

    // PAID stamp
    doc.save()
       .translate(430, 120)
       .rotate(-15)
       .roundedRect(0, 0, 100, 40, 4)
       .lineWidth(3).strokeColor('#2e7d32').stroke()
       .font('Helvetica-Bold').fontSize(20).fillColor('#2e7d32')
       .text('PAID', 18, 10)
       .restore();

    doc.moveTo(60, 175).lineTo(555, 175).lineWidth(0.5).strokeColor('#ddd').stroke();

    // Details table
    const lineH = 22;
    let y = 190;
    const col1 = 60, col2 = 220;

    function row(label, value) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#333').text(label, col1, y);
      doc.font('Helvetica').fontSize(11).fillColor('#000').text(value, col2, y);
      y += lineH;
    }

    row('Tenant',          tenantName);
    row('Property',        payment.property_name || '—');
    row('Unit',            payment.unit_number   || '—');
    row('Payment Date',    formattedDate);
    row('Payment Method',  method);
    row('Amount Paid',     formattedAmount);
    row('Managed by',      landlordName);
    if (payment.notes) row('Notes', payment.notes);

    doc.moveTo(60, y + 5).lineTo(555, y + 5).lineWidth(0.5).strokeColor('#ddd').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#aaa')
       .text('This is an official payment receipt generated by LotLord. Please retain for your records.', 60, y + 15, { width: 495 });

    doc.end();
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
  getReceipt,
};
