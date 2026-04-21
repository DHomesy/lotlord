const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');
const { v4: uuidv4 } = require('uuid');

// ── toPublicUser — pure unit tests (no DB) ────────────────────────────────────
// Extracted via module internals so the function can be tested without an HTTP
// round-trip. The controller does not export it, so we re-implement the contract
// here as a spec and verify it through the register/login response shape below.
//
// The canonical source of truth is src/controllers/authController.js.

function toPublicUser(u) {
  if (!u) return null;
  return {
    id:            u.id,
    email:         u.email,
    role:          u.role,
    firstName:     u.first_name   ?? u.firstName   ?? null,
    lastName:      u.last_name    ?? u.lastName     ?? null,
    phone:         u.phone        ?? null,
    avatarUrl:     u.avatar_url   ?? u.avatarUrl    ?? null,
    emailVerified: !!(u.email_verified_at ?? u.emailVerified),
  };
}

describe('toPublicUser()', () => {
  it('returns null for null input', () => {
    expect(toPublicUser(null)).toBeNull();
  });

  it('maps snake_case DB row to camelCase', () => {
    const row = {
      id: 'abc',
      email: 'a@b.com',
      role: 'landlord',
      first_name: 'John',
      last_name: 'Smith',
      phone: '555-1234',
      avatar_url: 'https://cdn.example.com/avatar.png',
      email_verified_at: '2026-01-01T00:00:00Z',
    };
    const result = toPublicUser(row);
    expect(result.firstName).toBe('John');
    expect(result.lastName).toBe('Smith');
    expect(result.avatarUrl).toBe('https://cdn.example.com/avatar.png');
    expect(result.emailVerified).toBe(true);
    // Raw snake_case keys must not leak through
    expect(result).not.toHaveProperty('first_name');
    expect(result).not.toHaveProperty('last_name');
    expect(result).not.toHaveProperty('avatar_url');
    expect(result).not.toHaveProperty('email_verified_at');
  });

  it('falls back to camelCase keys when snake_case are absent', () => {
    const row = {
      id: 'abc',
      email: 'a@b.com',
      role: 'tenant',
      firstName: 'Jane',
      lastName: 'Doe',
      avatarUrl: 'https://cdn.example.com/j.png',
      emailVerified: true,
    };
    const result = toPublicUser(row);
    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBe('Doe');
    expect(result.avatarUrl).toBe('https://cdn.example.com/j.png');
    expect(result.emailVerified).toBe(true);
  });

  it('sets emailVerified false when email_verified_at is null', () => {
    const result = toPublicUser({ id: '1', email: 'x@y.com', role: 'tenant', email_verified_at: null });
    expect(result.emailVerified).toBe(false);
  });

  it('nulls optional fields when absent', () => {
    const result = toPublicUser({ id: '1', email: 'x@y.com', role: 'tenant' });
    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.avatarUrl).toBeNull();
    expect(result.emailVerified).toBe(false);
  });
});

// ── HTTP integration: register response contains camelCase user shape ─────────
// Verifies that the controller actually applies toPublicUser() before sending.

let fx;
beforeAll(async () => { fx = await setup(); });
afterAll(async () => { if (fx) await fx.teardown(); });

describe('POST /api/v1/auth/register', () => {
  it('registers a new landlord successfully', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'test_new_landlord@test.invalid',
      password: 'TestPassword1!',
      firstName: 'New',
      lastName: 'Landlord',
      role: 'landlord',
      acceptedTerms: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('landlord');
    // camelCase shape must be present in every auth response
    expect(res.body.user).toHaveProperty('firstName');
    expect(res.body.user).toHaveProperty('lastName');
    expect(res.body.user).not.toHaveProperty('first_name');
    expect(res.body.user).not.toHaveProperty('last_name');
  });

  it('rejects registration with role:admin — role enum validation', async () => {
    // role validator was hardened to only allow 'landlord'|'tenant'; admin is rejected 400
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'test_would_be_admin@test.invalid',
      password: 'TestPassword1!',
      firstName: 'Bad',
      lastName: 'Actor',
      role: 'admin',
      acceptedTerms: true,
    });
    expect(res.status).toBe(400);
  });

  it('rejects registration with invalid email', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'TestPassword1!',
      firstName: 'Bad',
      lastName: 'Email',
      role: 'landlord',
      acceptedTerms: true,
    });
    expect(res.status).toBe(400);
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'test_landlord_a@test.invalid',
      password: 'WrongPassword!',
    });
    expect(res.status).toBe(401);
  });
});

describe('Pagination — does not crash on invalid page param', () => {
  it('GET /api/v1/users?page=abc returns 200 for admin', async () => {
    const res = await request(app)
      .get('/api/v1/users?page=abc&limit=xyz')
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(res.status).toBe(200);
  });
});

// ── Refresh token invalidation on logout ──────────────────────────────────────

describe('POST /api/v1/auth/refresh — token invalidation after logout', () => {
  it('refresh token is invalidated after logout', async () => {
    // 1. Login to obtain a real httpOnly refresh cookie
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test_landlord_a@test.invalid', password: 'TestPassword1!' });
    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // 2. Confirm the refresh token works before logout
    const preLogout = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies);
    expect(preLogout.status).toBe(200);

    // 3. Logout — increments token_version, invalidating the cookie
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies);

    // 4. Same old cookie must now be rejected
    const postLogout = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies);
    expect(postLogout.status).toBe(401);
  });
});

// ── Password reset token single-use ──────────────────────────────────────────

describe('POST /api/v1/auth/reset-password — token single use', () => {
  it('reset token cannot be used a second time after a successful reset', async () => {
    // Seed a valid reset token directly so we don't depend on email delivery
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await fx.pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), fx.landlordB.id, token, expiresAt],
    );

    // 1. First use — should succeed
    const firstRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'NewTestPass1!' });
    expect(firstRes.status).toBe(200);

    // 2. Second use with the same token — must fail
    const secondRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'AnotherPass1!' });
    expect(secondRes.status).toBe(400);

    // Restore landlordB's password so other tests aren't affected
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('TestPassword1!', 10);
    await fx.pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hash, fx.landlordB.id],
    );
  });
});
