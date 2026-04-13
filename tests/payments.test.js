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
