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
