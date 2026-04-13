const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');
const { v4: uuidv4 } = require('uuid');

let fx;
let requestAId;
let requestBId;

beforeAll(async () => {
  fx = await setup();

  requestAId = uuidv4();
  requestBId = uuidv4();

  await fx.pool.query(
    `INSERT INTO maintenance_requests (id, unit_id, submitted_by, title, description, category, priority, status)
     VALUES
       ($1, $3, $5, 'Test Req A', 'Fix A', 'other', 'medium', 'open'),
       ($2, $4, $6, 'Test Req B', 'Fix B', 'other', 'medium', 'open')`,
    [requestAId, requestBId, fx.unitA.id, fx.unitB.id, fx.tenantA.id, fx.tenantB.id],
  );
});
afterAll(async () => { if (fx) await fx.teardown(); });

describe('GET /api/v1/maintenance', () => {
  it('landlordA lists maintenance, only sees unitA requests', async () => {
    const res = await request(app)
      .get('/api/v1/maintenance')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((r) => r.id);
    expect(ids).toContain(requestAId);
    expect(ids).not.toContain(requestBId);
  });

  it('tenantA lists own maintenance requests', async () => {
    const res = await request(app)
      .get('/api/v1/maintenance')
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((r) => r.id);
    expect(ids).toContain(requestAId);
    expect(ids).not.toContain(requestBId);
  });
});

describe('GET /api/v1/maintenance/:id', () => {
  it('landlordA fetches own maintenance request', async () => {
    const res = await request(app)
      .get(`/api/v1/maintenance/${requestAId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordA cannot fetch landlordB maintenance request', async () => {
    const res = await request(app)
      .get(`/api/v1/maintenance/${requestBId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });

  it('tenantA fetches own maintenance request', async () => {
    const res = await request(app)
      .get(`/api/v1/maintenance/${requestAId}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
  });

  it('tenantA cannot fetch tenantB maintenance request', async () => {
    const res = await request(app)
      .get(`/api/v1/maintenance/${requestBId}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(403);
  });
});
