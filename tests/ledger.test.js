const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');
const { v4: uuidv4 } = require('uuid');

let fx;
let ledgerEntryId;
beforeAll(async () => {
  fx = await setup();

  // Insert a ledger entry on leaseA so statement tests have data to query
  ledgerEntryId = uuidv4();
  await fx.pool.query(
    `INSERT INTO ledger_entries (id, lease_id, entry_type, amount, balance_after, description)
     VALUES ($1, $2, 'payment', 1000, 0, 'Test payment')`,
    [ledgerEntryId, fx.leaseA.id],
  );
});
afterAll(async () => { if (fx) await fx.teardown(); });

describe('GET /api/v1/ledger — amountDueNow (v1.7.2)', () => {
  let chargeOverdueId;
  let chargeFutureId;

  beforeAll(async () => {
    // Overdue charge (due yesterday)
    chargeOverdueId = uuidv4();
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 800, CURRENT_DATE - INTERVAL '1 day')`,
      [chargeOverdueId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId],
    );
    // Future charge (due next month — should be excluded from amountDueNow)
    chargeFutureId = uuidv4();
    await fx.pool.query(
      `INSERT INTO rent_charges (id, unit_id, lease_id, tenant_id, charge_type, amount, due_date)
       VALUES ($1, $2, $3, $4, 'rent', 900, CURRENT_DATE + INTERVAL '30 days')`,
      [chargeFutureId, fx.unitA.id, fx.leaseA.id, fx.tenantA.tenantProfileId],
    );
  });

  it('ledger response includes amountDueNow field', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.amountDueNow).toBe('number');
  });

  it('amountDueNow excludes future-dated charges', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    // amountDueNow must equal the overdue charge (800), not include future charge (900)
    expect(res.body.amountDueNow).toBe(800);
  });

  it('amountDueNow decreases after a partial payment is recorded', async () => {
    // Record a partial payment of 300 against the overdue charge
    const partialPayId = uuidv4();
    await fx.pool.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 300, CURRENT_DATE, 'cash', 'completed')`,
      [partialPayId, fx.leaseA.id, chargeOverdueId],
    );

    const res = await request(app)
      .get(`/api/v1/ledger?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    // 800 (overdue) - 300 (paid) = 500
    expect(res.body.amountDueNow).toBe(500);
  });

  it('amountDueNow is not inflated when a charge has multiple partial payments (regression)', async () => {
    // Add a second partial payment of 200 (total paid = 500, remaining = 300)
    const partialPay2Id = uuidv4();
    await fx.pool.query(
      `INSERT INTO rent_payments (id, lease_id, charge_id, amount_paid, payment_date, payment_method, status)
       VALUES ($1, $2, $3, 200, CURRENT_DATE, 'cash', 'completed')`,
      [partialPay2Id, fx.leaseA.id, chargeOverdueId],
    );

    const res = await request(app)
      .get(`/api/v1/ledger?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    // 800 (overdue) - 500 (total paid 300+200) = 300
    // A LEFT JOIN bug would incorrectly inflate charge to 800*2=1600 and give a wrong number
    expect(res.body.amountDueNow).toBe(300);
  });
});

describe('GET /api/v1/ledger', () => {
  it('landlordA fetches ledger for own lease', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordA cannot fetch ledger for landlordB lease', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger?leaseId=${fx.leaseB.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });

  it('tenantA fetches own lease ledger', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
  });

  it('tenantA cannot supply leaseB leaseId', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger?leaseId=${fx.leaseB.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(403);
  });
});

// ── Statement endpoint ────────────────────────────────────────────────────────

describe('GET /api/v1/ledger/statement', () => {
  it('unauthenticated request returns 401', async () => {
    const res = await request(app).get(`/api/v1/ledger/statement?leaseId=${fx.leaseA.id}`);
    expect(res.status).toBe(401);
  });

  it('landlordA can fetch statement for their own lease', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('landlordB cannot fetch statement for landlordA lease (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(403);
  });

  it('tenantA can fetch statement for their own lease', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('tenantB cannot fetch statement for tenantA lease (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.tenantB.token}`);
    expect(res.status).toBe(403);
  });

  it('date range filter returns only entries within range', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/v1/ledger/statement?leaseId=${fx.leaseA.id}&from=${today}&to=${tomorrow}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    // The ledger entry we inserted today must appear
    const ids = res.body.entries.map((e) => e.id);
    expect(ids).toContain(ledgerEntryId);
  });

  it('date range that excludes all entries returns empty array', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement?leaseId=${fx.leaseA.id}&from=2000-01-01&to=2000-01-31`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });
});

// ── Statement — employee scoping ──────────────────────────────────────────────

describe('GET /api/v1/ledger/statement — employee scoping', () => {
  it('employeeA (employer=landlordA) can fetch statement for employer lease', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('employeeA cannot fetch statement for landlordB lease (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement?leaseId=${fx.leaseB.id}`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(403);
  });
});

// ── Statement PDF (S9) ────────────────────────────────────────────────────────

describe('GET /api/v1/ledger/statement/pdf', () => {
  it('unauthenticated request returns 401', async () => {
    const res = await request(app).get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseA.id}`);
    expect(res.status).toBe(401);
  });

  it('missing leaseId returns 400', async () => {
    const res = await request(app)
      .get('/api/v1/ledger/statement/pdf')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(400);
  });

  it('landlordA downloads PDF statement for own lease', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
  });

  it('tenantA downloads PDF statement for own lease', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('landlordB cannot download PDF for landlordA lease (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.landlordB.token}`);
    expect(res.status).toBe(403);
  });

  it('tenantB cannot download PDF for tenantA lease (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.tenantB.token}`);
    expect(res.status).toBe(403);
  });

  it('employeeA downloads PDF statement for employer lease', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('employeeA cannot download PDF for landlordB lease (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseB.id}`)
      .set('Authorization', `Bearer ${fx.employeeA.token}`);
    expect(res.status).toBe(403);
  });

  it('nonexistent leaseId returns 404', async () => {
    const { v4: uuidv4 } = require('uuid');
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${uuidv4()}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(404);
  });

  it('date filters are accepted and PDF is still returned', async () => {
    const today    = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseA.id}&from=${today}&to=${tomorrow}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('invalid from date returns 400', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseA.id}&from=not-a-date`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(400);
  });

  it('invalid to date returns 400', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseA.id}&to=badvalue`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(400);
  });

  it('Content-Disposition filename does not contain injected characters', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/v1/ledger/statement/pdf?leaseId=${fx.leaseA.id}&from=${today}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const disposition = res.headers['content-disposition'];
    // Verify no CRLF header-injection characters leaked through
    expect(disposition).not.toMatch(/[\r\n]/);
    // Verify the from slug in the filename is the sanitized ISO date (digits + hyphens only)
    expect(disposition).toMatch(/statement-[a-f0-9]+-[0-9-]+-[a-z0-9-]+\.pdf/);
  });
});

describe('GET /api/v1/ledger/statement — date validation', () => {
  it('invalid from date returns 400', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement?leaseId=${fx.leaseA.id}&from=not-a-date`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(400);
  });

  it('invalid to date returns 400', async () => {
    const res = await request(app)
      .get(`/api/v1/ledger/statement?leaseId=${fx.leaseA.id}&to=badvalue`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(400);
  });
});
