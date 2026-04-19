const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');

let fx;
beforeAll(async () => { fx = await setup(); });
afterAll(async () => { if (fx) await fx.teardown(); });

describe('GET /api/v1/units', () => {
  it('landlordA only sees own units in list', async () => {
    const res = await request(app)
      .get('/api/v1/units')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((u) => u.id);
    expect(ids).toContain(fx.unitA.id);
    expect(ids).not.toContain(fx.unitB.id);
  });

  it('page=abc does not crash (NaN OFFSET guard)', async () => {
    const res = await request(app)
      .get('/api/v1/units?page=abc&limit=xyz')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/units/:id', () => {
  it('landlordA gets own unit', async () => {
    const res = await request(app)
      .get(`/api/v1/units/${fx.unitA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordA cannot get landlordB unit', async () => {
    const res = await request(app)
      .get(`/api/v1/units/${fx.unitB.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });
});

describe('Multi-family unit cap (4 units max)', () => {
  let multiPropId;

  beforeAll(async () => {
    // Admin bypasses plan limits — create a multi-family property directly
    const propRes = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${fx.admin.token}`)
      .send({ name: 'Cap Test Multi', addressLine1: '99 Cap St', city: 'Testville', state: 'TX', zip: '00001', propertyType: 'multi' });
    expect(propRes.status).toBe(201);
    multiPropId = propRes.body.id;

    // Create 4 units — all should succeed
    for (let i = 1; i <= 4; i++) {
      const r = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${fx.admin.token}`)
        .send({ propertyId: multiPropId, unitNumber: String(i), rentAmount: 100, status: 'vacant' });
      expect(r.status).toBe(201);
    }
  });

  it('rejects a 5th unit on a multi-family property with 422 MULTI_FAMILY_CAP', async () => {
    const res = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${fx.admin.token}`)
      .send({ propertyId: multiPropId, unitNumber: '5', rentAmount: 100, status: 'vacant' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MULTI_FAMILY_CAP');
  });

  it('allows adding a unit after deleting one (cap is not a ratchet)', async () => {
    // Fetch units to find one to delete
    const listRes = await request(app)
      .get(`/api/v1/units?propertyId=${multiPropId}`)
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(listRes.status).toBe(200);
    const unitToDelete = listRes.body[0];
    expect(unitToDelete).toBeDefined();

    // Delete it
    await request(app)
      .delete(`/api/v1/units/${unitToDelete.id}`)
      .set('Authorization', `Bearer ${fx.admin.token}`);

    // Now we have 3 units — adding one more should succeed
    const addRes = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${fx.admin.token}`)
      .send({ propertyId: multiPropId, unitNumber: 'Re-added', rentAmount: 100, status: 'vacant' });
    expect(addRes.status).toBe(201);
  });
});

describe('Commercial property has no unit cap', () => {
  let commPropId;

  beforeAll(async () => {
    // Admin bypasses commercial plan gate
    const propRes = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${fx.admin.token}`)
      .send({ name: 'Corp HQ', addressLine1: '1 Commerce Blvd', city: 'Testville', state: 'TX', zip: '00001', propertyType: 'commercial' });
    expect(propRes.status).toBe(201);
    commPropId = propRes.body.id;
  });

  it('allows more than 4 units on a commercial property', async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${fx.admin.token}`)
        .send({ propertyId: commPropId, unitNumber: String(i), rentAmount: 500, status: 'vacant' });
      expect(r.status).toBe(201);
    }
  });
});

describe('Unit creation — property validation', () => {
  it('returns 404 when propertyId does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${fx.admin.token}`)
      .send({ propertyId: '00000000-0000-0000-0000-000000000000', unitNumber: '1', rentAmount: 100, status: 'vacant' });
    expect(res.status).toBe(404);
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app)
      .post('/api/v1/units')
      .send({ propertyId: fx.propertyA.id, unitNumber: '99', rentAmount: 100, status: 'vacant' });
    expect(res.status).toBe(401);
  });

  it('landlord B cannot add units to landlord A property (403)', async () => {
    const res = await request(app)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${fx.landlordB.token}`)
      .send({ propertyId: fx.propertyA.id, unitNumber: '99', rentAmount: 100, status: 'vacant' });
    expect(res.status).toBe(403);
  });
});
