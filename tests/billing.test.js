const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');

let fx;

beforeAll(async () => { fx = await setup(); });
afterAll(async () => { if (fx) await fx.teardown(); });

// ── GET /api/v1/billing/status ─────────────────────────────────────────────

describe('GET /api/v1/billing/status', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).get('/api/v1/billing/status');
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by a tenant', async () => {
    const res = await request(app)
      .get('/api/v1/billing/status')
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when called by an admin', async () => {
    const res = await request(app)
      .get('/api/v1/billing/status')
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(res.status).toBe(403);
  });

  it('returns subscription status for a landlord (none when unsubscribed)', async () => {
    const res = await request(app)
      .get('/api/v1/billing/status')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'none', plan: null });
  });
});

// ── POST /api/v1/billing/checkout ─────────────────────────────────────────────

describe('POST /api/v1/billing/checkout', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .send({ plan: 'starter' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by a tenant', async () => {
    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .set('Authorization', `Bearer ${fx.tenantA.token}`)
      .send({ plan: 'starter' });
    expect(res.status).toBe(403);
  });

  it('returns 403 when called by an admin', async () => {
    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .set('Authorization', `Bearer ${fx.admin.token}`)
      .send({ plan: 'starter' });
    expect(res.status).toBe(403);
  });
});

// ── POST /api/v1/billing/portal ───────────────────────────────────────────────

describe('POST /api/v1/billing/portal', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).post('/api/v1/billing/portal');
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by a tenant', async () => {
    const res = await request(app)
      .post('/api/v1/billing/portal')
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when called by an admin', async () => {
    const res = await request(app)
      .post('/api/v1/billing/portal')
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 when landlord has no billing account yet', async () => {
    // No Stripe call is made — the service throws before reaching Stripe
    // because the test landlord has no stripe_billing_customer_id in the DB
    const res = await request(app)
      .post('/api/v1/billing/portal')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/billing/admin/landlords ───────────────────────────────────────

describe('GET /api/v1/billing/admin/landlords', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).get('/api/v1/billing/admin/landlords');
    expect(res.status).toBe(401);
  });

  it('returns 403 when called by a landlord', async () => {
    const res = await request(app)
      .get('/api/v1/billing/admin/landlords')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when called by a tenant', async () => {
    const res = await request(app)
      .get('/api/v1/billing/admin/landlords')
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(403);
  });

  it('returns list of landlords for admin', async () => {
    const res = await request(app)
      .get('/api/v1/billing/admin/landlords')
      .set('Authorization', `Bearer ${fx.admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // The test landlords should be in the list
    const emails = res.body.map((l) => l.email);
    expect(emails).toContain('test_landlord_a@test.invalid');
    expect(emails).toContain('test_landlord_b@test.invalid');
  });
});

// ── POST /api/v1/webhooks/stripe ──────────────────────────────────────────────
// Signature verification is handled by stripeService.handleWebhookEvent.
// With no STRIPE_WEBHOOK_SECRET configured in test, Stripe rejects any
// signature — we verify that the route guards these correctly.

describe('POST /api/v1/webhooks/stripe', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'invoice.payment_failed' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when stripe-signature is invalid', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'invalid-signature')
      .send(JSON.stringify({ type: 'invoice.payment_failed' }));
    expect(res.status).toBe(400);
  });
});

// ── requiresStarter subscription gate ────────────────────────────────────────
// Tests that endpoints protected by requiresStarter correctly block access
// for unsubscribed, past_due, and cancelled landlords.

describe('requiresStarter gate — GET /api/v1/analytics/dashboard', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).get('/api/v1/analytics/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 402 SUBSCRIPTION_REQUIRED for a free-plan landlord', async () => {
    // landlordA has subscription_status='none' (fixture default)
    const res = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('returns 402 for a past_due landlord (payment failed — access suspended)', async () => {
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'past_due', subscription_plan = 'starter' WHERE id = $1`,
      [fx.landlordA.id],
    );
    try {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${fx.landlordA.token}`);
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    } finally {
      await fx.pool.query(
        `UPDATE users SET subscription_status = 'none', subscription_plan = NULL WHERE id = $1`,
        [fx.landlordA.id],
      );
    }
  });

  it('returns 402 for a canceled landlord', async () => {
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'canceled', subscription_plan = 'starter' WHERE id = $1`,
      [fx.landlordA.id],
    );
    try {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${fx.landlordA.token}`);
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
    } finally {
      await fx.pool.query(
        `UPDATE users SET subscription_status = 'none', subscription_plan = NULL WHERE id = $1`,
        [fx.landlordA.id],
      );
    }
  });

  it('returns 200 for an active starter landlord', async () => {
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'active', subscription_plan = 'starter' WHERE id = $1`,
      [fx.landlordA.id],
    );
    try {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${fx.landlordA.token}`);
      expect(res.status).toBe(200);
    } finally {
      await fx.pool.query(
        `UPDATE users SET subscription_status = 'none', subscription_plan = NULL WHERE id = $1`,
        [fx.landlordA.id],
      );
    }
  });

  it('returns 200 for a trialing landlord', async () => {
    await fx.pool.query(
      `UPDATE users SET subscription_status = 'trialing', subscription_plan = 'starter' WHERE id = $1`,
      [fx.landlordA.id],
    );
    try {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${fx.landlordA.token}`);
      expect(res.status).toBe(200);
    } finally {
      await fx.pool.query(
        `UPDATE users SET subscription_status = 'none', subscription_plan = NULL WHERE id = $1`,
        [fx.landlordA.id],
      );
    }
  });

  it('admin bypasses the subscription gate', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${fx.admin.token}`);
    // Admin reaches the handler — any non-402/403 is acceptable
    expect(res.status).not.toBe(402);
    expect(res.status).not.toBe(403);
  });
});
