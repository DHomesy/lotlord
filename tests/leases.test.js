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

// ── Co-tenant scope (Audit 2 — employee authorization fix) ───────────────────
// Regression guard: addCoTenant/removeCoTenant previously only checked
// `role === 'landlord'`, allowing any employee to modify co-tenants on any lease.
// Fixed to use resolveOwnerId so employees are scoped to their employer's leases.

describe("GET /api/v1/leases/:id/co-tenants — employee scope fix", () => {
  it("employeeA can list co-tenants on employer's lease", async () => {
    const res = await request(app)
      .get(`/api/v1/leases/${fx.leaseA.id}/co-tenants`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("employeeA cannot list co-tenants on landlordB's lease (403)", async () => {
    const res = await request(app)
      .get(`/api/v1/leases/${fx.leaseB.id}/co-tenants`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(403);
  });

  it("employeeA cannot add a co-tenant to landlordB's lease (403)", async () => {
    const res = await request(app)
      .post(`/api/v1/leases/${fx.leaseB.id}/co-tenants`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`)
      .send({ tenantId: fx.tenantA.tenantProfileId });
    expect(res.status).toBe(403);
  });

  it("employeeA cannot remove a co-tenant from landlordB's lease (403)", async () => {
    const res = await request(app)
      .delete(`/api/v1/leases/${fx.leaseB.id}/co-tenants/${fx.tenantB.tenantProfileId}`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(403);
  });
});
