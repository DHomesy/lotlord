/**
 * Integration tests for notification endpoints — specifically the
 * ownership-scoping security fix: landlords/employees must only see
 * conversations and log entries for their own tenants.
 *
 * Requires a running test DB (DATABASE_URL env var).
 */

const request = require('supertest');
const app     = require('../src/app');
const { setup } = require('./helpers/setup');
const { v4: uuidv4 } = require('uuid');

let fx;

// Seed a notifications_log entry for each tenant so the conversations
// endpoint has data to return.
beforeAll(async () => {
  fx = await setup();

  // Insert a sent email log entry for tenantA (belongs to landlordA)
  await fx.pool.query(
    `INSERT INTO notifications_log (id, recipient_id, channel, status, body)
     VALUES ($1, $2, 'email', 'sent', 'Test message for tenantA')`,
    [uuidv4(), fx.tenantA.id],
  );

  // Insert a sent email log entry for tenantB (belongs to landlordB)
  await fx.pool.query(
    `INSERT INTO notifications_log (id, recipient_id, channel, status, body)
     VALUES ($1, $2, 'email', 'sent', 'Test message for tenantB')`,
    [uuidv4(), fx.tenantB.id],
  );
});

afterAll(async () => { if (fx) await fx.teardown(); });

// ── GET /api/v1/notifications/messages ───────────────────────────────────────

describe('GET /api/v1/notifications/messages (conversations)', () => {
  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/notifications/messages');
    expect(res.status).toBe(401);
  });

  it('admin can see all conversations (no ownership filter)', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/messages')
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Admin should see both tenantA and tenantB
    const ids = res.body.map((c) => c.user_id);
    expect(ids).toContain(fx.tenantA.id);
    expect(ids).toContain(fx.tenantB.id);
  });

  it('landlordA can only see their own tenants — not landlordB tenants', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/messages')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((c) => c.user_id);
    expect(ids).toContain(fx.tenantA.id);
    expect(ids).not.toContain(fx.tenantB.id);
  });

  it('landlordB can only see their own tenants — not landlordA tenants', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/messages')
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((c) => c.user_id);
    expect(ids).toContain(fx.tenantB.id);
    expect(ids).not.toContain(fx.tenantA.id);
  });

  it('employeeA (employer=landlordA) can only see landlordA tenants', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/messages')
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((c) => c.user_id);
    expect(ids).toContain(fx.tenantA.id);
    expect(ids).not.toContain(fx.tenantB.id);
  });
});

// ── GET /api/v1/notifications/messages/:tenantId ─────────────────────────────

describe('GET /api/v1/notifications/messages/:tenantId (conversation thread)', () => {
  it('admin can fetch any tenant conversation', async () => {
    const res = await request(app)
      .get(`/api/v1/notifications/messages/${fx.tenantA.tenantProfileId}`)
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tenant');
    expect(res.body).toHaveProperty('messages');
  });

  it('landlordA can fetch conversation for their own tenant', async () => {
    const res = await request(app)
      .get(`/api/v1/notifications/messages/${fx.tenantA.tenantProfileId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordA cannot fetch conversation for landlordB tenant (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/notifications/messages/${fx.tenantB.tenantProfileId}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });

  it('landlordB cannot fetch conversation for landlordA tenant (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/notifications/messages/${fx.tenantA.tenantProfileId}`)
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent tenantId', async () => {
    const res = await request(app)
      .get(`/api/v1/notifications/messages/${uuidv4()}`)
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /api/v1/notifications/messages ──────────────────────────────────────

describe('POST /api/v1/notifications/messages (send message)', () => {
  it('landlordA cannot send a message to a tenant belonging to landlordB (403)', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/messages')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ tenantId: fx.tenantB.tenantProfileId, subject: 'Test', body: 'Hello' });
    expect(res.status).toBe(403);
  });

  it('landlordB cannot send a message to a tenant belonging to landlordA (403)', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/messages')
      .set('Authorization', `Bearer ${fx.landlordB.token}`)
      .send({ tenantId: fx.tenantA.tenantProfileId, subject: 'Test', body: 'Hello' });
    expect(res.status).toBe(403);
  });

  it('employeeA cannot send a message to a tenant outside their employer landlord (403)', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/messages')
      .set('Authorization', `Bearer ${fx.employeeA.token}`)
      .send({ tenantId: fx.tenantB.tenantProfileId, subject: 'Test', body: 'Hello' });
    expect(res.status).toBe(403);
  });
});


describe('GET /api/v1/notifications/log (notification log)', () => {
  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/notifications/log');
    expect(res.status).toBe(401);
  });

  it('admin can see log entries for all tenants', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/log')
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const recipientIds = res.body.map((e) => e.recipient_id);
    expect(recipientIds).toContain(fx.tenantA.id);
    expect(recipientIds).toContain(fx.tenantB.id);
  });

  it('landlordA log only contains their own tenant entries', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/log')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const recipientIds = res.body.map((e) => e.recipient_id);
    // Should include tenantA but not tenantB
    expect(recipientIds.every((id) => id !== fx.tenantB.id)).toBe(true);
  });

  it('landlordA cannot query recipientId of landlordB tenant via ?recipientId', async () => {
    const res = await request(app)
      .get(`/api/v1/notifications/log?recipientId=${fx.tenantB.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    // Should return 200 with empty results, not the cross-landlord tenant's log
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('employeeA log only contains employer (landlordA) tenant entries', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/log')
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(200);
    const recipientIds = res.body.map((e) => e.recipient_id);
    expect(recipientIds.every((id) => id !== fx.tenantB.id)).toBe(true);
  });
});
