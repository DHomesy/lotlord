const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');

let fx;
beforeAll(async () => { fx = await setup(); });
afterAll(async () => { if (fx) await fx.teardown(); });

describe('GET /api/v1/units', () => {
  it('landlordA only sees own units in list', async () => {
    const res = await request(app)
      .get('/api/v1/units')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((u) => u.id);
    expect(ids).toContain(fx.unitA.id);
    expect(ids).not.toContain(fx.unitB.id);
  });

  it('page=abc does not crash (NaN OFFSET guard)', async () => {
    const res = await request(app)
      .get('/api/v1/units?page=abc&limit=xyz')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/units/:id', () => {
  it('landlordA gets own unit', async () => {
    const res = await request(app)
      .get(`/api/v1/units/${fx.unitA.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
  });

  it('landlordA cannot get landlordB unit', async () => {
    const res = await request(app)
      .get(`/api/v1/units/${fx.unitB.id}`)
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(403);
  });
});
