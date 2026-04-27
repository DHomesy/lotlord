/**
 * Pure unit tests for auth middleware.
 *
 * No HTTP server, no DB. Uses a hand-rolled mock for req/res/next so these
 * run in milliseconds and catch regressions without any test-DB dependency.
 */

const jwt = require('jsonwebtoken');

// Mock the DB module with a factory so the destructured `query` reference
// inside auth.js (which loads at require-time) also gets the mocked version.
jest.mock('../src/config/db', () => ({ query: jest.fn(), getClient: jest.fn() }));

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body;   return this; },
  };
  return res;
}

function mockNext() {
  const fn = jest.fn();
  return fn;
}

// ── authorize() ──────────────────────────────────────────────────────────────

const { authorize } = require('../src/middleware/auth');

describe('authorize()', () => {
  it('calls next() when user role is in the allowed list', () => {
    const req  = { user: { role: 'landlord' } };
    const res  = mockRes();
    const next = mockNext();

    authorize('admin', 'landlord')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  it('returns 403 when user role is NOT in the allowed list', () => {
    const req  = { user: { role: 'tenant' } };
    const res  = mockRes();
    const next = mockNext();

    authorize('admin', 'landlord')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  it('returns 403 when req.user is undefined', () => {
    const req  = {};
    const res  = mockRes();
    const next = mockNext();

    authorize('landlord')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  it('allows employee through an employee-permitted route', () => {
    const req  = { user: { role: 'employee' } };
    const res  = mockRes();
    const next = mockNext();

    authorize('admin', 'landlord', 'employee')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('blocks employee from a landlord-only route', () => {
    const req  = { user: { role: 'employee' } };
    const res  = mockRes();
    const next = mockNext();

    authorize('admin', 'landlord')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  it('allows a single allowed role (no spread)', () => {
    const req  = { user: { role: 'admin' } };
    const res  = mockRes();
    const next = mockNext();

    authorize('admin')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ── requiresStarter() ─────────────────────────────────────────────────────────
//
// userRepo.findBillingStatus is the only DB call inside requiresStarter.
// We mock the module so no DB connection is needed.

jest.mock('../src/dal/userRepository', () => ({
  findBillingStatus: jest.fn(),
}));

const { requiresStarter } = require('../src/middleware/auth');
const userRepo = require('../src/dal/userRepository');

describe('requiresStarter()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('admin bypasses billing check entirely', async () => {
    const req  = { user: { role: 'admin', sub: 'admin-id' } };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(userRepo.findBillingStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('landlord with active subscription passes', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'active' });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  it('landlord on trialing subscription passes', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'trialing' });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('landlord with no subscription returns 402', async () => {
    userRepo.findBillingStatus.mockResolvedValue(null);

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(402);
    expect(res._body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('landlord with cancelled subscription returns 402', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'canceled' });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(402);
  });

  it('employee billing check uses employerId (employer plan), not employee sub', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'active' });

    const req = {
      user: { role: 'employee', sub: 'employee-own-id', employerId: 'employer-id' },
    };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    // Must query employer's billing, not the employee's own row
    expect(userRepo.findBillingStatus).toHaveBeenCalledWith('employer-id');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('employee with no-subscription employer is blocked (402)', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'past_due' });

    const req = {
      user: { role: 'employee', sub: 'employee-own-id', employerId: 'employer-id' },
    };
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(res._status).toBe(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when req.user is missing', async () => {
    const req  = {};
    const res  = mockRes();
    const next = mockNext();

    await requiresStarter(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── checkPlanLimit() ──────────────────────────────────────────────────────────

const { checkPlanLimit } = require('../src/middleware/auth');

describe('checkPlanLimit()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('admin bypasses plan limit check without calling DB', async () => {
    const req  = { user: { role: 'admin', sub: 'admin-id' } };
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('properties')(req, res, next);

    expect(userRepo.findBillingStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('admin can add employees regardless of plan (bypass)', async () => {
    const req  = { user: { role: 'admin', sub: 'admin-id' } };
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('employees')(req, res, next);

    expect(userRepo.findBillingStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when req.user is missing', async () => {
    const req  = {};
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('properties')(req, res, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws for unsupported resource name', () => {
    expect(() => checkPlanLimit('invoices')).toThrow(/unsupported resource/);
  });
});

// ── resolveOwnerId() ──────────────────────────────────────────────────────────

const { resolveOwnerId } = require('../src/lib/authHelpers');

describe('resolveOwnerId()', () => {
  it('returns sub for a landlord', () => {
    expect(resolveOwnerId({ sub: 'landlord-id', role: 'landlord' })).toBe('landlord-id');
  });

  it('returns sub for an admin', () => {
    expect(resolveOwnerId({ sub: 'admin-id', role: 'admin' })).toBe('admin-id');
  });

  it('returns employerId for an employee', () => {
    expect(resolveOwnerId({ sub: 'emp-id', role: 'employee', employerId: 'employer-id' })).toBe('employer-id');
  });

  it('throws 401 when employee has no employerId claim', () => {
    expect(() => resolveOwnerId({ sub: 'emp-id', role: 'employee' })).toThrow('Employee token missing employerId claim');
  });
});

// ── authenticate() ────────────────────────────────────────────────────────────
//
// Tests the token parsing and verification logic. Uses a real JWT signed with
// the test JWT_SECRET (set by the test environment) so no mocking is needed.

const { authenticate } = require('../src/middleware/auth');

// Use the same secret the app loads in test mode
const TEST_SECRET = process.env.JWT_SECRET || 'test_secret';

function makeToken(payload, secret = TEST_SECRET, options = { expiresIn: '15m' }) {
  return jwt.sign(payload, secret, options);
}

describe('authenticate()', () => {
  it('calls next() and attaches decoded payload to req.user for a valid token', () => {
    const payload = { sub: 'user-1', role: 'landlord', email: 'a@b.com' };
    const token   = makeToken(payload);

    const req  = { headers: { authorization: `Bearer ${token}` } };
    const res  = mockRes();
    const next = mockNext();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.sub).toBe('user-1');
    expect(req.user.role).toBe('landlord');
    expect(res._status).toBeNull();
  });

  it('returns 401 when Authorization header is missing', () => {
    const req  = { headers: {} };
    const res  = mockRes();
    const next = mockNext();

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('returns 401 when Authorization header does not start with "Bearer "', () => {
    const req  = { headers: { authorization: 'Basic sometoken' } };
    const res  = mockRes();
    const next = mockNext();

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', () => {
    const token = makeToken({ sub: 'user-1', role: 'admin' }, 'wrong-secret');

    const req  = { headers: { authorization: `Bearer ${token}` } };
    const res  = mockRes();
    const next = mockNext();

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('returns 401 for a token that is expired', () => {
    const token = makeToken({ sub: 'user-1', role: 'admin' }, TEST_SECRET, { expiresIn: -1 });

    const req  = { headers: { authorization: `Bearer ${token}` } };
    const res  = mockRes();
    const next = mockNext();

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('returns 401 for a completely malformed token string', () => {
    const req  = { headers: { authorization: 'Bearer not.a.jwt' } };
    const res  = mockRes();
    const next = mockNext();

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });
});

// ── checkPlanLimit() — plan tier scenarios ────────────────────────────────────
//
// Extends the existing checkPlanLimit describe block with tests for free-tier
// limit enforcement and starter-tier pass-through.

describe('checkPlanLimit() — free tier at capacity returns 402', () => {
  const db = require('../src/config/db');
  beforeEach(() => jest.clearAllMocks());

  it('free landlord at property limit (1) is blocked with PLAN_LIMIT code', async () => {
    userRepo.findBillingStatus.mockResolvedValue(null); // free = no active sub
    db.query.mockResolvedValue({ rows: [{ cnt: 1 }] });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('properties')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(402);
    expect(res._body.code).toBe('PLAN_LIMIT');
  });

  it('free landlord below property limit passes through', async () => {
    userRepo.findBillingStatus.mockResolvedValue(null);
    db.query.mockResolvedValue({ rows: [{ cnt: 0 }] });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('properties')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  it('starter landlord with 24 properties can add one more (limit is 25)', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'active', subscription_plan: 'starter' });
    db.query.mockResolvedValue({ rows: [{ cnt: 24 }] });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('properties')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('starter landlord at property limit (25) is blocked', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'active', subscription_plan: 'starter' });
    db.query.mockResolvedValue({ rows: [{ cnt: 25 }] });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('properties')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(402);
    expect(res._body.code).toBe('PLAN_LIMIT');
  });

  it('free landlord blocked from adding employees (limit is 0)', async () => {
    userRepo.findBillingStatus.mockResolvedValue(null);
    // Limit is 0, so DB count query is never reached — middleware short-circuits.
    // But if it were reached, it would return 0.
    db.query.mockResolvedValue({ rows: [{ cnt: 0 }] });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('employees')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(402);
    expect(res._body.code).toBe('PLAN_LIMIT');
  });

  it('enterprise landlord bypasses plan limit entirely', async () => {
    userRepo.findBillingStatus.mockResolvedValue({ subscription_status: 'active', subscription_plan: 'enterprise' });

    const req  = { user: { role: 'landlord', sub: 'landlord-id' } };
    const res  = mockRes();
    const next = mockNext();

    await checkPlanLimit('employees')(req, res, next);

    // No DB query for count needed — enterprise passes immediately
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });
});
