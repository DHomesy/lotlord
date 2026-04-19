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

describe('POST /api/v1/maintenance', () => {
  it('tenant creates a maintenance request for their own unit', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ unitId: fx.unitA.id, category: 'plumbing', priority: 'medium', title: 'Dripping tap', description: 'Needs fixing' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Dripping tap');
    expect(res.body.status).toBe('open');
  });

  it('tenant cannot create a request for a unit they have no lease on', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ unitId: fx.unitB.id, category: 'other', priority: 'low', title: 'Not mine', description: 'x' });
    expect(res.status).toBe(403);
  });

  it('landlord can create a request on their own unit', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ unitId: fx.unitA.id, category: 'electric', priority: 'high', title: 'Outlet sparking', description: 'Urgent' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('open');
  });

  it('returns 404 when unitId does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ unitId: '00000000-0000-0000-0000-000000000000', category: 'other', priority: 'low', title: 'Ghost unit', description: 'x' });
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/v1/maintenance')
      .send({ unitId: fx.unitA.id, category: 'other', priority: 'low', title: 'x', description: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/maintenance/:id — status transitions', () => {
  it('landlord moves request to in_progress', async () => {
    const res = await request(app)
      .patch(`/api/v1/maintenance/${requestAId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.resolved_at).toBeNull();
  });

  it('landlord marks request completed — resolved_at is set', async () => {
    const res = await request(app)
      .patch(`/api/v1/maintenance/${requestAId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.resolved_at).not.toBeNull();
  });

  it('landlord A cannot update landlord B request', async () => {
    const res = await request(app)
      .patch(`/api/v1/maintenance/${requestBId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(403);
  });

  it('tenant can cancel their own open request', async () => {
    // Create a fresh open request so we have a clean state to cancel
    const createRes = await request(app)
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ unitId: fx.unitA.id, category: 'other', priority: 'low', title: 'Cancel me', description: 'x' });
    expect(createRes.status).toBe(201);

    const cancelRes = await request(app)
      .patch(`/api/v1/maintenance/${createRes.body.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ status: 'cancelled' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('cancelled');
  });

  it('tenant cannot set status to in_progress', async () => {
    const res = await request(app)
      .patch(`/api/v1/maintenance/${requestAId}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .patch(`/api/v1/maintenance/${requestAId}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(401);
  });
});
