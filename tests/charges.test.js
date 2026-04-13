const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');
const { v4: uuidv4 } = require('uuid');

let fx;
let chargeAId;

beforeAll(async () => {
  fx = await setup();

  // Insert a charge on unitA/leaseA
  chargeAId = uuidv4();
  await fx.pool.query(
    `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
     VALUES ($1, $2, $3, $4, 'rent', 1000, CURRENT_DATE + INTERVAL '1 month')`,
    [chargeAId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId],
  );
});
afterAll(async () => { if (fx) await fx.teardown(); });

describe('GET /api/v1/charges/:id', () => {
  it('landlordA fetches own charge', async () => {
    const res = await request(app)
      .get(`/api/v1/charges/${chargeAId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordB cannot fetch landlordA charge', async () => {
    const res = await request(app)
      .get(`/api/v1/charges/${chargeAId}`)
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(403);
  });

  it('tenantA can fetch own charge', async () => {
    const res = await request(app)
      .get(`/api/v1/charges/${chargeAId}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/charges — cross-unit guard', () => {
  it('landlordA cannot create a charge on landlordB unit', async () => {
    const res = await request(app)
      .post('/api/v1/charges')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        unitId: fx.unitB.id,
        leaseId: fx.leaseB.id,
        chargeType: 'rent',
        amount: 1200,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      });
    expect(res.status).toBe(403);
  });
});
