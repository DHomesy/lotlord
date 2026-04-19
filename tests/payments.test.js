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
