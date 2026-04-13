const request = require('supertest');
const app = require('../src/app');
const { setup } = require('./helpers/setup');

let fx;
beforeAll(async () => { fx = await setup(); });
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
