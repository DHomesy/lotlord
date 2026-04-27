const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');

let fx;
beforeAll(async () => { fx = await setup(); });
afterAll(async () => { if (fx) await fx.teardown(); });

describe('GET /api/v1/properties/:id', () => {
  it('owner gets their own property', async () => {
    const res = await request(app)
      .get(`/api/v1/properties/${fx.propertyA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fx.propertyA.id);
  });

  it('landlord B cannot get landlord A property', async () => {
    const res = await request(app)
      .get(`/api/v1/properties/${fx.propertyA.id}`)
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(403);
  });

  it('tenant cannot access a property directly', async () => {
    const res = await request(app)
      .get(`/api/v1/properties/${fx.propertyA.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(403);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app).get(`/api/v1/properties/${fx.propertyA.id}`);
    expect(res.status).toBe(401);
  });
});

describe('Commercial property plan gate', () => {
  it('rejects commercial property creation for a free-plan landlord (402 PLAN_LIMIT — property cap reached first)', async () => {
    // LandlordA already has 1 property from fixtures — free plan max is 1.
    // checkPlanLimit fires before the service-level commercial check, so PLAN_LIMIT is returned.
    const res = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ name: 'Shop Denied', addressLine1: '1 Shop St', city: 'Testville', state: 'TX', zip: '00001', propertyType: 'commercial' });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PLAN_LIMIT');
  });

  it('rejects commercial property creation for a Starter-plan landlord (402 COMMERCIAL_REQUIRED)', async () => {
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'active', subscription_plan = 'starter' WHERE id = $1`,
      [fx.landlordA.id],
    );
    try {
      const res = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${fx.landlordA.token}`)
        .send({ name: 'Shop Starter', addressLine1: '3 Starter St', city: 'Testville', state: 'TX', zip: '00001', propertyType: 'commercial' });
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('COMMERCIAL_REQUIRED');
    } finally {
      await fx.pool.query(`UPDATE users SET subscription_status = 'none', subscription_plan = NULL WHERE id = $1`, [fx.landlordA.id]);
    }
  });

  it('rejects commercial property creation for an Enterprise-plan landlord (402 COMMERCIAL_REQUIRED)', async () => {
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'active', subscription_plan = 'enterprise' WHERE id = $1`,
      [fx.landlordA.id],
    );
    try {
      const res = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${fx.landlordA.token}`)
        .send({ name: 'Shop Enterprise', addressLine1: '4 Enterprise St', city: 'Testville', state: 'TX', zip: '00001', propertyType: 'commercial' });
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('COMMERCIAL_REQUIRED');
    } finally {
      await fx.pool.query(`UPDATE users SET subscription_status = 'none', subscription_plan = NULL WHERE id = $1`, [fx.landlordA.id]);
    }
  });

  it('allows commercial property creation when landlord has an active commercial subscription', async () => {
    // Grant landlordA a commercial plan for this test, then restore afterward
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'active', subscription_plan = 'commercial' WHERE id = $1`,
      [fx.landlordA.id],
    );
    try {
      const res = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${fx.landlordA.token}`)
        .send({ name: 'Corp Tower', addressLine1: '2 Commerce Ave', city: 'Testville', state: 'TX', zip: '00001', propertyType: 'commercial' });
      expect(res.status).toBe(201);
      expect(res.body.property_type).toBe('commercial');
    } finally {
      // Restore to free plan so other tests are not affected
      await fx.pool.query(
        `UPDATE users SET subscription_status = 'none', subscription_plan = NULL WHERE id = $1`,
        [fx.landlordA.id],
      );
    }
  });
});

describe('Commercial property PATCH type-promotion gate', () => {
  let multiPropId;

  beforeAll(async () => {
    // Temporarily upgrade to starter so landlordA can bypass the 1-property free-plan limit
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'active', subscription_plan = 'starter' WHERE id = $1`,
      [fx.landlordA.id],
    );
    const propRes = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ name: 'Upgrade Target', addressLine1: '77 Promo Ave', city: 'Testville', state: 'TX', zip: '00001', propertyType: 'multi' });
    await fx.pool.query(`UPDATE users SET subscription_status = 'none', subscription_plan = NULL WHERE id = $1`, [fx.landlordA.id]);
    expect(propRes.status).toBe(201);
    multiPropId = propRes.body.id;
  });

  it('rejects PATCH propertyType to commercial on a free-plan landlord (402)', async () => {
    const res = await request(app)
      .patch(`/api/v1/properties/${multiPropId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ propertyType: 'commercial' });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('COMMERCIAL_REQUIRED');
  });

  it('allows PATCH name/address on an existing commercial property without re-checking the plan', async () => {
    // Create a commercial property as admin, then edit its name as landlordA
    // First give landlordA commercial plan so they can own it
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'active', subscription_plan = 'commercial' WHERE id = $1`,
      [fx.landlordA.id],
    );
    let commPropId;
    try {
      const createRes = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${fx.landlordA.token}`)
        .send({ name: 'Editable Corp', addressLine1: '88 Corp Blvd', city: 'Testville', state: 'TX', zip: '00001', propertyType: 'commercial' });
      expect(createRes.status).toBe(201);
      commPropId = createRes.body.id;
    } finally {
      // Downgrade back to free plan BEFORE the patch test
      await fx.pool.query(`UPDATE users SET subscription_status = 'none', subscription_plan = NULL WHERE id = $1`, [fx.landlordA.id]);
    }

    // Now on free plan, editing name only should succeed (no type change)
    const patchRes = await request(app)
      .patch(`/api/v1/properties/${commPropId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ name: 'Renamed Corp' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.name).toBe('Renamed Corp');
  });

  it('returns 401 when no auth token provided for property creation', async () => {
    const res = await request(app)
      .post('/api/v1/properties')
      .send({ name: 'No Auth', addressLine1: '1 Anon St', city: 'Testville' });
    expect(res.status).toBe(401);
  });
});

// ── Audit 2 — S2: cascadeArchive atomicity ────────────────────────────────────
// Verifies that DELETE /api/v1/properties/:id atomically terminates leases,
// soft-deletes units, and soft-deletes the property via the transaction-wrapped
// cascadeArchive function (previously the three writes were not in a transaction).

describe('DELETE /api/v1/properties/:id — cascadeArchive atomicity (Audit 2 S2)', () => {
  let archivePropId;
  let archiveUnitId;
  let archiveLeaseId;

  beforeAll(async () => {
    // Create a fresh property + unit + active lease owned by landlordA
    const { v4: uuid } = require('uuid');
    archivePropId  = uuid();
    archiveUnitId  = uuid();
    archiveLeaseId = uuid();

    await fx.pool.query(
      `INSERT INTO properties (id, owner_id, name, address_line1, city, state, zip)
       VALUES ($1, $2, 'Archive Test Prop', '1 Archive Ave', 'Testville', 'TX', '00001')`,
      [archivePropId, fx.landlordA.id],
    );
    await fx.pool.query(
      `INSERT INTO units (id, property_id, unit_number, status, rent_amount)
       VALUES ($1, $2, '1A', 'occupied', 1000)`,
      [archiveUnitId, archivePropId],
    );
    await fx.pool.query(
      `INSERT INTO leases (id, unit_id, tenant_id, start_date, end_date, monthly_rent, status)
       VALUES ($1, $2, $3, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '335 days', 1000, 'active')`,
      [archiveLeaseId, archiveUnitId, fx.tenantA.tenantProfileId],
    );
  });

  it('deletes the property (204)', async () => {
    const res = await request(app)
      .delete(`/api/v1/properties/${archivePropId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(204);
  });

  it('property is soft-deleted (deleted_at is set)', async () => {
    const { rows } = await fx.pool.query(
      `SELECT deleted_at FROM properties WHERE id = $1`,
      [archivePropId],
    );
    expect(rows[0]).toBeDefined();
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('unit is soft-deleted (deleted_at is set)', async () => {
    const { rows } = await fx.pool.query(
      `SELECT deleted_at FROM units WHERE id = $1`,
      [archiveUnitId],
    );
    expect(rows[0]).toBeDefined();
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('active lease is terminated', async () => {
    const { rows } = await fx.pool.query(
      `SELECT status FROM leases WHERE id = $1`,
      [archiveLeaseId],
    );
    expect(rows[0]).toBeDefined();
    expect(rows[0].status).toBe('terminated');
  });

  it('landlordB cannot archive landlordA property (403)', async () => {
    // Create another property so there is something to attempt to delete
    const { v4: uuid } = require('uuid');
    const propId = uuid();
    await fx.pool.query(
      `INSERT INTO properties (id, owner_id, name, address_line1, city, state, zip)
       VALUES ($1, $2, 'B Steals A Prop', '2 Archive Ave', 'Testville', 'TX', '00001')`,
      [propId, fx.landlordA.id],
    );
    const res = await request(app)
      .delete(`/api/v1/properties/${propId}`)
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(403);
    // Clean up
    await fx.pool.query(`DELETE FROM properties WHERE id = $1`, [propId]);
  });
});
