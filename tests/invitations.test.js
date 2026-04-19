const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');
const { v4: uuidv4 } = require('uuid');

let fx;
// Employee invitation fixtures (created directly in DB to avoid email delivery)
let empInviteToken;
let empInviteToken2;

beforeAll(async () => {
  fx = await setup();

  empInviteToken  = `testemptoken${uuidv4().replace(/-/g, '')}`;
  empInviteToken2 = `testemptoken${uuidv4().replace(/-/g, '')}`;

  await fx.pool.query(
    `INSERT INTO tenant_invitations (id, token, invited_by, email, first_name, last_name, type, expires_at)
     VALUES
       ($1, $2, $3, 'test_emp_accept@test.invalid', 'Emp', 'Accept', 'employee', NOW() + INTERVAL '7 days'),
       ($4, $5, $3, 'test_emp_accept2@test.invalid', 'Emp2', 'Accept2', 'employee', NOW() + INTERVAL '7 days')`,
    [uuidv4(), empInviteToken, fx.landlordA.id, uuidv4(), empInviteToken2],
  );
});
afterAll(async () => { if (fx) await fx.teardown(); });

describe('POST /api/v1/invitations/:id/resend', () => {
  it('landlordA can resend own invitation', async () => {
    const res = await request(app)
      .post(`/api/v1/invitations/${fx.inviteA.id}/resend`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordA cannot resend landlordB invitation', async () => {
    const res = await request(app)
      .post(`/api/v1/invitations/${fx.inviteB.id}/resend`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/invitations/:id', () => {
  it('landlordB can cancel own invitation', async () => {
    const res = await request(app)
      .delete(`/api/v1/invitations/${fx.inviteB.id}`)
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(204);
  });

  it('landlordA cannot cancel landlordB invitation (already cancelled or 403)', async () => {
    // inviteA is still untouched; try to cancel it as landlordB
    const res = await request(app)
      .delete(`/api/v1/invitations/${fx.inviteA.id}`)
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(403);
  });
});

// ── Accept employee invitation ────────────────────────────────────────────────

describe('POST /api/v1/invitations/accept (employee type)', () => {
  it('accepting an employee invitation creates a user with role=employee and correct employer_id', async () => {
    const res = await request(app)
      .post('/api/v1/invitations/accept')
      .send({
        token:         empInviteToken,
        firstName:     'Emp',
        lastName:      'Accept',
        email:         'test_emp_accept@test.invalid',
        password:      'StrongP@ss1!',
        acceptedTerms: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('employee');
    expect(res.body.user.employer_id).toBe(fx.landlordA.id);
    // No tenant record should exist for an employee
    expect(res.body.tenant).toBeFalsy();
  });

  it('accepting the same employee invitation twice returns 410', async () => {
    const res = await request(app)
      .post('/api/v1/invitations/accept')
      .send({
        token:         empInviteToken,
        firstName:     'Emp',
        lastName:      'Accept',
        email:         'test_emp_accept@test.invalid',
        password:      'StrongP@ss1!',
        acceptedTerms: true,
      });
    // Already accepted — 410 Gone
    expect(res.status).toBe(410);
  });

  it('required fields validation — missing acceptedTerms returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/invitations/accept')
      .send({
        token:     empInviteToken2,
        firstName: 'Emp2',
        lastName:  'Accept2',
        email:     'test_emp_accept2@test.invalid',
        password:  'StrongP@ss1!',
        // acceptedTerms intentionally omitted
      });
    expect(res.status).toBe(400);
  });
});

// ── Employee creates tenant invitation — invitedBy scoped to employer ─────────

describe('POST /api/v1/invitations — employee invitedBy scoping', () => {
  it('tenant invitation created by employee appears in landlord invitation list', async () => {
    // Employee creates a tenant invitation (resolved as employer's invitation)
    const createRes = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${fx.employeeA.token}`)
      .send({ email: 'test_emp_invite_tenant@test.invalid', firstName: 'Emp', lastName: 'Invited' });
    expect(createRes.status).toBe(201);

    // Landlord should see this invitation in their list
    const listRes = await request(app)
      .get('/api/v1/invitations')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(listRes.status).toBe(200);
    const emails = listRes.body.map((i) => i.email);
    expect(emails).toContain('test_emp_invite_tenant@test.invalid');
  });
});
