const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');

let fx;
beforeAll(async () => { fx = await setup(); });
afterAll(async () => { if (fx) await fx.teardown(); });

describe('GET /api/v1/tenants', () => {
  it('landlordA lists tenants, only sees own', async () => {
    const res = await request(app)
      .get('/api/v1/tenants')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((t) => t.user_id);
    expect(ids).toContain(fx.tenantA.id);
    expect(ids).not.toContain(fx.tenantB.id);
  });

  it('tenant cannot list all tenants', async () => {
    const res = await request(app)
      .get('/api/v1/tenants')
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/tenants/:id', () => {
  it('landlordA fetches own tenant profile', async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${fx.tenantA.tenantProfileId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordA cannot fetch landlordB tenant', async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${fx.tenantB.tenantProfileId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });

  it('tenantA can fetch own profile', async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/${fx.tenantA.tenantProfileId}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
  });
});
