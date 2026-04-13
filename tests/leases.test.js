const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');

let fx;
beforeAll(async () => { fx = await setup(); });
afterAll(async () => { if (fx) await fx.teardown(); });

describe('GET /api/v1/leases', () => {
  it('landlordA only sees own lease in list', async () => {
    const res = await request(app)
      .get('/api/v1/leases')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((l) => l.id);
    expect(ids).toContain(fx.leaseA.id);
    expect(ids).not.toContain(fx.leaseB.id);
  });

  it('tenantA only sees own lease in list', async () => {
    const res = await request(app)
      .get('/api/v1/leases')
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((l) => l.id);
    expect(ids).toContain(fx.leaseA.id);
    expect(ids).not.toContain(fx.leaseB.id);
  });
});

describe('GET /api/v1/leases/:id', () => {
  it('landlordA fetches own lease', async () => {
    const res = await request(app)
      .get(`/api/v1/leases/${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordA cannot fetch landlordB lease', async () => {
    const res = await request(app)
      .get(`/api/v1/leases/${fx.leaseB.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });

  it('tenantA fetches own lease', async () => {
    const res = await request(app)
      .get(`/api/v1/leases/${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
  });

  it('tenantA cannot fetch tenantB lease', async () => {
    const res = await request(app)
      .get(`/api/v1/leases/${fx.leaseB.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(403);
  });
});
