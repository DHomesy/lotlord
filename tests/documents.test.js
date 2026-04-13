const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');
const { v4: uuidv4 } = require('uuid');

let fx;
let docAId;

beforeAll(async () => {
  fx = await setup();

  // Insert a document owned by landlordA, related to leaseA
  docAId = uuidv4();
  await fx.pool.query(
    `INSERT INTO documents (id, owner_id, related_id, related_type, file_url, file_name, file_type, uploaded_by)
     VALUES ($1, $2, $3, 'lease', 'https://s3.test/doc-a.pdf', 'doc-a.pdf', 'application/pdf', $2)`,
    [docAId, fx.landlordA.id, fx.leaseA.id],
  );
});
afterAll(async () => { if (fx) await fx.teardown(); });

describe('GET /api/v1/documents', () => {
  it('landlordA fetches own documents', async () => {
    const res = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${fx.landlordA.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((d) => d.id);
    expect(ids).toContain(docAId);
  });

  it('tenantA fetches own documents (empty is fine, not 500)', async () => {
    const res = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${fx.tenantA.token}`);
    expect(res.status).toBe(200);
  });

  it('tenantA cannot access landlordA documents by supplying relatedId', async () => {
    // Supplying a relatedId that belongs to landlordA's lease should not expose docs
    const res = await request(app)
      .get(`/api/v1/documents?relatedId=${fx.leaseA.id}`)
      .set('Authorization', `Bearer ${fx.tenantA.token}`);

    // Either 403 blocked, OR returned but only shows tenantA-accessible docs (not landlordA's)
    if (res.status === 200) {
      const ownerIds = res.body.map((d) => d.owner_id);
      expect(ownerIds).not.toContain(fx.landlordA.id);
    } else {
      expect(res.status).toBe(403);
    }
  });
});
