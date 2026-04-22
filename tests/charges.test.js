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

// ── POST /api/v1/charges/batch ────────────────────────────────────────────────

function nextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

describe('POST /api/v1/charges/batch', () => {
  it('landlordA creates a batch of charges for own unit+lease', async () => {
    const res = await request(app)
      .post('/api/v1/charges/batch')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        charges: [
          { unitId: fx.unitA.id, leaseId: fx.leaseA.id, tenantId: fx.tenantA.tenantProfileId, chargeType: 'rent', amount: 1000, dueDate: nextMonth() },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.charges).toHaveLength(1);
    expect(res.body.charges[0].charge_type).toBe('rent');
  });

  it('landlordA cannot batch-create charges on landlordB unit (IDOR)', async () => {
    const res = await request(app)
      .post('/api/v1/charges/batch')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        charges: [
          { unitId: fx.unitB.id, chargeType: 'rent', amount: 1200, dueDate: nextMonth() },
        ],
      });
    expect(res.status).toBe(403);
  });

  it('rejects an empty charges array', async () => {
    const res = await request(app)
      .post('/api/v1/charges/batch')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ charges: [] });
    expect(res.status).toBe(400);
  });

  it('rejects when charges exceeds 500 items', async () => {
    const charges = Array.from({ length: 501 }, (_, i) => ({
      unitId: fx.unitA.id, chargeType: 'rent', amount: 10,
      dueDate: new Date(Date.now() + (i + 1) * 86400000).toISOString().split('T')[0],
    }));
    const res = await request(app)
      .post('/api/v1/charges/batch')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ charges });
    expect(res.status).toBe(400);
  });

  it('rejects a charge with an invalid dueDate format', async () => {
    const res = await request(app)
      .post('/api/v1/charges/batch')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        charges: [{ unitId: fx.unitA.id, chargeType: 'rent', amount: 100, dueDate: 'not-a-date' }],
      });
    expect(res.status).toBe(400);
  });

  it('rejects a charge with an invalid chargeType', async () => {
    const res = await request(app)
      .post('/api/v1/charges/batch')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        charges: [{ unitId: fx.unitA.id, chargeType: 'hacking', amount: 100, dueDate: nextMonth() }],
      });
    expect(res.status).toBe(400);
  });

  it('rejects when amount is zero', async () => {
    const res = await request(app)
      .post('/api/v1/charges/batch')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({
        charges: [{ unitId: fx.unitA.id, chargeType: 'rent', amount: 0, dueDate: nextMonth() }],
      });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/v1/charges/batch')
      .send({ charges: [{ unitId: fx.unitA.id, amount: 100, dueDate: nextMonth() }] });
    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/charges/void-by-unit ────────────────────────────────────────

describe('POST /api/v1/charges/void-by-unit', () => {
  it('landlordA voids all unpaid charges on own unit', async () => {
    // Seed a charge to void
    const seedId = uuidv4();
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 500, CURRENT_DATE + INTERVAL '2 months')`,
      [seedId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId],
    );

    const res = await request(app)
      .post('/api/v1/charges/void-by-unit')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ unitId: fx.unitA.id });

    expect(res.status).toBe(200);
    expect(res.body.voided).toBeGreaterThanOrEqual(1);

    // Confirm the charge is now voided in the DB
    const { rows } = await fx.pool.query(
      `SELECT voided_at FROM rent_charges WHERE id = $1`,
      [seedId],
    );
    expect(rows[0].voided_at).not.toBeNull();
  });

  it('landlordA cannot void charges on landlordB unit (IDOR)', async () => {
    const res = await request(app)
      .post('/api/v1/charges/void-by-unit')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ unitId: fx.unitB.id });
    expect(res.status).toBe(403);
  });

  it('rejects missing unitId', async () => {
    const res = await request(app)
      .post('/api/v1/charges/void-by-unit')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects a non-UUID unitId', async () => {
    const res = await request(app)
      .post('/api/v1/charges/void-by-unit')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ unitId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('returns voided:0 when there are no eligible charges', async () => {
    // unitB has no unseeded charges (or all voided already) — should return 0 without error
    // Use a unit owned by landlordA that has no unseeded charges (use a fresh unit)
    const freshUnitId = uuidv4();
    await fx.pool.query(
      `INSERT INTO units (id, property_id, unit_number, rent_amount) VALUES ($1, $2, 'void-test-unit', 0)`,
      [freshUnitId, fx.propertyA.id],
    );

    const res = await request(app)
      .post('/api/v1/charges/void-by-unit')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ unitId: freshUnitId });

    expect(res.status).toBe(200);
    expect(res.body.voided).toBe(0);

    await fx.pool.query(`DELETE FROM units WHERE id = $1`, [freshUnitId]);
  });
});

// ── Partial charge status (v1.7.2) ───────────────────────────────────────────

describe('GET /api/v1/charges — partial status (v1.7.2)', () => {
  let partialChargeId;
  let fullChargeId;

  beforeAll(async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Charge that will receive a partial payment
    partialChargeId = uuidv4();
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 1000, $5)`,
      [partialChargeId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId, tomorrow],
    );
    // Record a partial payment (500 of 1000)
    await fx.pool.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 500, CURRENT_DATE, 'cash', 'completed')`,
      [uuidv4(), fx.leaseA.id, partialChargeId],
    );

    // Charge that will be fully paid
    fullChargeId = uuidv4();
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 600, $5)`,
      [fullChargeId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId, tomorrow],
    );
    await fx.pool.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 600, CURRENT_DATE, 'cash', 'completed')`,
      [uuidv4(), fx.leaseA.id, fullChargeId],
    );
  });

  it('returns status=partial for a partially-paid charge', async () => {
    const res = await request(app)
      .get(`/api/v1/charges?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const charge = res.body.find((c) => c.id === partialChargeId);
    expect(charge).toBeDefined();
    expect(charge.status).toBe('partial');
  });

  it('returns status=paid for a fully-paid charge', async () => {
    const res = await request(app)
      .get(`/api/v1/charges?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const charge = res.body.find((c) => c.id === fullChargeId);
    expect(charge).toBeDefined();
    expect(charge.status).toBe('paid');
  });

  it('unpaidOnly=true includes partial charges', async () => {
    const res = await request(app)
      .get(`/api/v1/charges?leaseId=${fx.leaseA.id}&unpaidOnly=true`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((c) => c.id);
    expect(ids).toContain(partialChargeId);
  });

  it('unpaidOnly=true excludes fully-paid charges', async () => {
    const res = await request(app)
      .get(`/api/v1/charges?leaseId=${fx.leaseA.id}&unpaidOnly=true`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((c) => c.id);
    expect(ids).not.toContain(fullChargeId);
  });
});
