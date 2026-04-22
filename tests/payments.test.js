const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');
const { v4: uuidv4 } = require('uuid');

let fx;
let paymentAId;
let chargeAId;

beforeAll(async () => {
  fx = await setup();

  // Insert a charge and payment on leaseA
  chargeAId  = uuidv4();
  paymentAId = uuidv4();

  await fx.pool.query(
    `INSERT INTO rent_charges (id, unit_id, lease_id, charge_type, amount, due_date)
     VALUES ($1, $2, $3, 'rent', 1000, CURRENT_DATE + INTERVAL '1 month')`,
    [chargeAId, fx.unitA.id, fx.leaseA.id],
  );
  await fx.pool.query(
    `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
     VALUES ($1, $2, $3, 1000, CURRENT_DATE, 'cash', 'completed')`,
    [paymentAId, fx.leaseA.id, chargeAId],
  );
});
afterAll(async () => { if (fx) await fx.teardown(); });

describe('GET /api/v1/payments?leaseId', () => {
  it('landlordA lists payments for own lease', async () => {
    const res = await request(app)
      .get(`/api/v1/payments?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordA cannot list payments for landlordB lease', async () => {
    const res = await request(app)
      .get(`/api/v1/payments?leaseId=${fx.leaseB.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });

  it('tenantA lists own lease payments', async () => {
    const res = await request(app)
      .get(`/api/v1/payments?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
  });

  it('tenantA cannot list payments for leaseB', async () => {
    const res = await request(app)
      .get(`/api/v1/payments?leaseId=${fx.leaseB.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/payments/:id', () => {
  it('landlordA fetches own payment', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${paymentAId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordB cannot fetch landlordA payment', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${paymentAId}`)
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(403);
  });
});

// ── Stripe ACH – access-control and early-return validation ─────────────────
// Happy-path Stripe tests (SetupIntent creation, PaymentIntent creation, bank
// account listing) require a live Stripe test key and are handled by manual /
// integration testing outside this suite.

describe('POST /api/v1/payments/stripe/setup-intent  (admin only)', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/setup-intent')
      .send({ tenantId: fx.tenantA.id });
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by a tenant', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/setup-intent')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ tenantId: fx.tenantA.id });
    expect(res.status).toBe(403);
  });

  it('returns 403 when called by a landlord', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/setup-intent')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ tenantId: fx.tenantA.id });
    expect(res.status).toBe(403);
  });

  it('returns 400 when tenantId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/setup-intent')
      .set('Authorization', `Bearer ${fx.admin.token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when tenantId is not a UUID', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/setup-intent')
      .set('Authorization', `Bearer ${fx.admin.token}`)
      .send({ tenantId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/payments/stripe/setup-intent/me  (tenant only)', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/setup-intent/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by a landlord', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/setup-intent/me')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when called by an admin', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/setup-intent/me')
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/payments/stripe/payment-methods/me  (tenant only)', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stripe/payment-methods/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by a landlord', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stripe/payment-methods/me')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when called by an admin', async () => {
    const res = await request(app)
      .get('/api/v1/payments/stripe/payment-methods/me')
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/payments/stripe/payment-methods/:tenantId  (admin only)', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/stripe/payment-methods/${fx?.tenantA?.id ?? uuidv4()}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by a landlord', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/stripe/payment-methods/${fx.tenantA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when called by a tenant', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/stripe/payment-methods/${fx.tenantA.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/payments/stripe/payment-intent/me  (tenant only)', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/payment-intent/me')
      .send({ paymentMethodId: 'pm_test_123', chargeId: chargeAId });
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by a landlord', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/payment-intent/me')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ paymentMethodId: 'pm_test_123', chargeId: chargeAId });
    expect(res.status).toBe(403);
  });

  it('returns 403 when called by an admin', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/payment-intent/me')
      .set('Authorization', `Bearer ${fx.admin.token}`)
      .send({ paymentMethodId: 'pm_test_123', chargeId: chargeAId });
    expect(res.status).toBe(403);
  });

  it('returns 400 when paymentMethodId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/payment-intent/me')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ chargeId: chargeAId });
    expect(res.status).toBe(400);
  });
});

// ── Receipt download ──────────────────────────────────────────────────────────

describe('GET /api/v1/payments/:id/receipt', () => {
  it('unauthenticated request returns 401', async () => {
    const res = await request(app).get(`/api/v1/payments/${paymentAId}/receipt`);
    expect(res.status).toBe(401);
  });

  it('landlordA can download a receipt for their own payment', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${paymentAId}/receipt`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('landlordB cannot download a receipt for landlordA payment (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${paymentAId}/receipt`)
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(403);
  });

  it('tenantA can download a receipt for their own payment', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${paymentAId}/receipt`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('tenantB cannot download a receipt belonging to tenantA (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${paymentAId}/receipt`)
      .set('Authorization', `Bearer ${fx.tenantB.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent payment ID', async () => {
    const { v4: uuidv4 } = require('uuid');
    const res = await request(app)
      .get(`/api/v1/payments/${uuidv4()}/receipt`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/payments/:id/receipt — employee scoping', () => {
  it('employeeA (employer=landlordA) can download receipt for landlordA payment', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${paymentAId}/receipt`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('employeeA cannot download receipt for a landlordB payment (403)', async () => {
    // Create a payment under landlordB's lease so we have a valid target
    const { v4: uuidv4 } = require('uuid');
    const chargeBId  = uuidv4();
    const paymentBId = uuidv4();
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, 'rent', 1200, CURRENT_DATE + INTERVAL '2 months')`,
      [chargeBId, fx.unitB.id, fx.leaseB.id],
    );
    await fx.pool.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 1200, CURRENT_DATE, 'cash', 'completed')`,
      [paymentBId, fx.leaseB.id, chargeBId],
    );

    const res = await request(app)
      .get(`/api/v1/payments/${paymentBId}/receipt`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/v1/payments (manual) — v1.7.2 ──────────────────────────────────

describe('POST /api/v1/payments — manual recording (v1.7.2)', () => {
  let manualChargeId;

  beforeAll(async () => {
    manualChargeId = uuidv4();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 750, $5)`,
      [manualChargeId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId, tomorrow],
    );
  });

  it('landlordA records a manual cash payment → 201', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        leaseId:       fx.leaseA.id,
        chargeId:      manualChargeId,
        amountPaid:    750,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
      });
    expect(res.status).toBe(201);
  });

  it('employeeA (employer=landlordA) can record manual payment → 201', async () => {
    const chargeId = uuidv4();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 400, $5)`,
      [chargeId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId, tomorrow],
    );

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${fx.employeeA.token}`)
      .send({
        leaseId:       fx.leaseA.id,
        chargeId,
        amountPaid:    400,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod: 'check',
      });
    expect(res.status).toBe(201);
  });

  it('employeeA cannot record payment for landlordB lease (403)', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${fx.employeeA.token}`)
      .send({
        leaseId:       fx.leaseB.id,
        amountPaid:    500,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
      });
    expect(res.status).toBe(403);
  });

  it('missing leaseId returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        amountPaid:    500,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
      });
    expect(res.status).toBe(400);
  });

  it('invalid paymentMethod returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        leaseId:       fx.leaseA.id,
        amountPaid:    500,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod: 'bitcoin',
      });
    expect(res.status).toBe(400);
  });

  it('zelle is accepted as a valid paymentMethod → 201', async () => {
    const chargeId = uuidv4();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 300, $5)`,
      [chargeId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId, tomorrow],
    );

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        leaseId:       fx.leaseA.id,
        chargeId,
        amountPaid:    300,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod: 'zelle',
      });
    expect(res.status).toBe(201);
  });
});

// ── POST /api/v1/payments/stripe/payment-intent/me — amount validation (v1.7.2) ──

describe('POST /api/v1/payments/stripe/payment-intent/me — amount validation (v1.7.2)', () => {
  it('amount=0 returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/payment-intent/me')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ paymentMethodId: 'pm_test_123', amount: 0 });
    expect(res.status).toBe(400);
  });

  it('amount=-5 returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/payments/stripe/payment-intent/me')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ paymentMethodId: 'pm_test_123', amount: -5 });
    expect(res.status).toBe(400);
  });

  it('amount > monthly_rent without chargeId returns 400 (security cap)', async () => {
    // leaseA has monthly_rent set on the lease — requesting far above it must be rejected
    const { rows } = await fx.pool.query(
      `SELECT monthly_rent FROM leases WHERE id = $1`,
      [fx.leaseA.id],
    );
    const cap = parseFloat(rows[0].monthly_rent);
    const res = await request(app)
      .post('/api/v1/payments/stripe/payment-intent/me')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ paymentMethodId: 'pm_test_123', amount: cap + 10000 });
    expect(res.status).toBe(400);
  });

  it('amount > charge.amount with valid chargeId returns 400', async () => {
    const chargeId = uuidv4();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 500, $5)`,
      [chargeId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId, tomorrow],
    );

    const res = await request(app)
      .post('/api/v1/payments/stripe/payment-intent/me')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ paymentMethodId: 'pm_test_123', chargeId, amount: 9999 });
    expect(res.status).toBe(400);
  });

  it('amount > remaining balance on a partial charge returns 400', async () => {
    // Create a charge and record a $300 partial payment against it
    const chargeId = uuidv4();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 1000, $5)`,
      [chargeId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId, tomorrow],
    );
    await fx.pool.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 300, CURRENT_DATE, 'stripe_ach', 'completed')`,
      [uuidv4(), fx.leaseA.id, chargeId],
    );

    // Remaining balance is $700 — passing $800 should be rejected
    const res = await request(app)
      .post('/api/v1/payments/stripe/payment-intent/me')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ paymentMethodId: 'pm_test_123', chargeId, amount: 800 });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/payments — manual recording, partial charge guard (v1.7.2) ──

describe('POST /api/v1/payments — manual recording partial charge guard (v1.7.2)', () => {
  it('can record a payment against a partially-paid charge (Bug A regression)', async () => {
    // Charge of $1000, already has a $300 partial payment
    const chargeId = uuidv4();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 1000, $5)`,
      [chargeId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId, tomorrow],
    );
    await fx.pool.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 300, CURRENT_DATE, 'cash', 'completed')`,
      [uuidv4(), fx.leaseA.id, chargeId],
    );

    // Should succeed — $700 remaining
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        leaseId:       fx.leaseA.id,
        chargeId,
        amountPaid:    700,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
      });
    expect(res.status).toBe(201);
  });

  it('returns 409 when a charge is already fully paid', async () => {
    const chargeId = uuidv4();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 500, $5)`,
      [chargeId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId, tomorrow],
    );
    await fx.pool.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 500, CURRENT_DATE, 'cash', 'completed')`,
      [uuidv4(), fx.leaseA.id, chargeId],
    );

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        leaseId:       fx.leaseA.id,
        chargeId,
        amountPaid:    100,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
      });
    expect(res.status).toBe(409);
  });

  it('returns 400 when amountPaid exceeds remaining balance', async () => {
    const chargeId = uuidv4();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 800, $5)`,
      [chargeId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId, tomorrow],
    );
    await fx.pool.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 200, CURRENT_DATE, 'cash', 'completed')`,
      [uuidv4(), fx.leaseA.id, chargeId],
    );

    // $700 remaining but trying to record $900
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        leaseId:       fx.leaseA.id,
        chargeId,
        amountPaid:    900,
        paymentDate:   new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
      });
    expect(res.status).toBe(400);
  });
});
