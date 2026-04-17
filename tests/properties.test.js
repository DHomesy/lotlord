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
  it('rejects commercial property creation for a free-plan landlord (402 COMMERCIAL_REQUIRED)', async () => {
    const res = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ name: 'Shop Denied', addressLine1: '1 Shop St', city: 'Testville', propertyType: 'commercial' });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('COMMERCIAL_REQUIRED');
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
        .send({ name: 'Shop Starter', addressLine1: '3 Starter St', city: 'Testville', propertyType: 'commercial' });
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('COMMERCIAL_REQUIRED');
    } finally {
      await fx.pool.query(`UPDATE users SET subscription_status = NULL, subscription_plan = NULL WHERE id = $1`, [fx.landlordA.id]);
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
        .send({ name: 'Shop Enterprise', addressLine1: '4 Enterprise St', city: 'Testville', propertyType: 'commercial' });
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('COMMERCIAL_REQUIRED');
    } finally {
      await fx.pool.query(`UPDATE users SET subscription_status = NULL, subscription_plan = NULL WHERE id = $1`, [fx.landlordA.id]);
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
        .send({ name: 'Corp Tower', addressLine1: '2 Commerce Ave', city: 'Testville', propertyType: 'commercial' });
      expect(res.status).toBe(201);
      expect(res.body.property_type).toBe('commercial');
    } finally {
      // Restore to free plan so other tests are not affected
      await fx.pool.query(
        `UPDATE users SET subscription_status = NULL, subscription_plan = NULL WHERE id = $1`,
        [fx.landlordA.id],
      );
    }
  });
});

describe('Commercial property PATCH type-promotion gate', () => {
  let multiPropId;

  beforeAll(async () => {
    const propRes = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ name: 'Upgrade Target', addressLine1: '77 Promo Ave', city: 'Testville', propertyType: 'multi' });
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
        .send({ name: 'Editable Corp', addressLine1: '88 Corp Blvd', city: 'Testville', propertyType: 'commercial' });
      expect(createRes.status).toBe(201);
      commPropId = createRes.body.id;
    } finally {
      // Downgrade back to free BEFORE the patch test
      await fx.pool.query(`UPDATE users SET subscription_status = NULL, subscription_plan = NULL WHERE id = $1`, [fx.landlordA.id]);
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
