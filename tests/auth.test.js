const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');

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
  });

  it('silently downgrades role:admin to landlord on self-register', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'test_would_be_admin@test.invalid',
      password: 'TestPassword1!',
      firstName: 'Bad',
      lastName: 'Actor',
      role: 'admin',
      acceptedTerms: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).not.toBe('admin');
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
