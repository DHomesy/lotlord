/**
 * Employee role integration tests.
 *
 * Covers:
 *   - POST /invitations/employee  (landlord-only gate)
 *   - Property scoping: employee sees employer's data, not other landlords'
 *   - Billing/plan gates check employer's plan for employees
 */
const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');

let fx;
beforeAll(async () => { fx = await setup(); });
afterAll(async () => { if (fx) await fx.teardown(); });

// ── POST /invitations/employee ────────────────────────────────────────────────

describe('POST /api/v1/invitations/employee', () => {
  // v1.8.0: employees are enterprise-only (starter=0, free=0).
  // Temporarily grant enterprise plan so the invitation can be created.
  beforeEach(async () => {
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'active', subscription_plan = 'enterprise' WHERE id = $1`,
      [fx.landlordA.id],
    );
  });
  afterEach(async () => {
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'none', subscription_plan = NULL WHERE id = $1`,
      [fx.landlordA.id],
    );
  });

  it('landlord can create an employee invitation', async () => {
    const res = await request(app)
      .post('/api/v1/invitations/employee')
      .set('Authorization', `Bearer ${fx.landlordA.token}`)
      .send({ email: 'new_employee@test.invalid', firstName: 'New', lastName: 'Emp' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('employee cannot create an employee invitation (forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/invitations/employee')
      .set('Authorization', `Bearer ${fx.employeeA.token}`)
      .send({ email: 'another_employee@test.invalid', firstName: 'Another', lastName: 'Emp' });
    expect(res.status).toBe(403);
  });

  it('tenant cannot create an employee invitation (forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/invitations/employee')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ email: 'yet_another_employee@test.invalid', firstName: 'Yet', lastName: 'Emp' });
    expect(res.status).toBe(403);
  });

  it('unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/invitations/employee')
      .send({ email: 'anon_employee@test.invalid', firstName: 'Anon', lastName: 'Emp' });
    expect(res.status).toBe(401);
  });
});

// ── Property scoping ──────────────────────────────────────────────────────────

describe('GET /api/v1/properties — employee scoped to employer', () => {
  it('employee sees employer (landlordA) properties', async () => {
    const res = await request(app)
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((p) => p.id);
    expect(ids).toContain(fx.propertyA.id);
  });

  it('employee does NOT see other landlord properties', async () => {
    const res = await request(app)
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((p) => p.id);
    expect(ids).not.toContain(fx.propertyB.id);
  });
});

describe('GET /api/v1/properties/:id — employee access control', () => {
  it('employee can fetch employer property by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/properties/${fx.propertyA.id}`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(200);
  });

  it('employee gets 403 for another landlord property', async () => {
    const res = await request(app)
      .get(`/api/v1/properties/${fx.propertyB.id}`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(403);
  });
});

// ── Unit scoping ──────────────────────────────────────────────────────────────

describe('GET /api/v1/units?propertyId — employee scoped', () => {
  it('employee can list units for employer property', async () => {
    const res = await request(app)
      .get(`/api/v1/units?propertyId=${fx.propertyA.id}`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(200);
  });

  it('employee cannot list units for another landlord property', async () => {
    const res = await request(app)
      .get(`/api/v1/units?propertyId=${fx.propertyB.id}`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(403);
  });
});

// ── Billing gate follows employer plan ────────────────────────────────────────

describe('POST /api/v1/invitations — employee uses employer plan limit', () => {
  it('employee can call the tenant-invite endpoint (employer plan checked)', async () => {
    // landlordA is on free tier (no subscription); free tier allows up to 4 tenants.
    // leaseA occupies 1 slot, so this should succeed (not hit the 402 gate).
    const res = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${fx.employeeA.token}`)
      .send({
        email: 'employee_invited_tenant@test.invalid',
        firstName: 'Invited',
        lastName: 'ByEmployee',
        unitId: fx.unitA.id,
      });
    // 201 = invitation created; 409 = duplicate (if re-run on same DB) — both are acceptable
    expect([201, 409]).toContain(res.status);
  });
});
