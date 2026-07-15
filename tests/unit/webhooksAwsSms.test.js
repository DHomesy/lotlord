/**
 * Unit tests for AWS SMS webhook route behavior.
 *
 * Covers:
 * - production secret enforcement
 * - SNS envelope parsing
 * - inbound dedupe by externalId
 * - STOP consent handling
 */

const request = require('supertest');

function buildAwsSnsMessage(overrides = {}) {
  return {
    originationNumber: '+14155550100',
    destinationNumber: '+15125550111',
    messageKeyword: 'KEYWORD',
    messageBody: 'Hello',
    inboundMessageId: 'inbound-123',
    previousPublishedMessageId: 'prev-456',
    ...overrides,
  };
}

function setup({ envOverrides = {}, repoOverrides = {} } = {}) {
  jest.resetModules();

  const defaults = {
    NODE_ENV: 'test',
    SMS_PROVIDER: 'aws',
    AWS_SMS_WEBHOOK_SECRET: 'test-secret',
    APP_BASE_URL: 'http://localhost:3000',
    TWILIO_AUTH_TOKEN: '',
    SES_WEBHOOK_SECRET: '',
  };

  const mocks = {
    handleInboundSms: jest.fn().mockResolvedValue(),
    findByPhone: jest.fn().mockResolvedValue({ id: 'tenant-user-1' }),
    findByAwsSmsNumber: jest.fn().mockResolvedValue({ id: 'owner-1' }),
    findByTwilioSmsNumber: jest.fn().mockResolvedValue(null),
    findByUserId: jest.fn().mockResolvedValue({ id: 'tenant-record-1' }),
    findLogByExternalId: jest.fn().mockResolvedValue(null),
    createLogEntry: jest.fn().mockResolvedValue({ id: 'log-1' }),
    upsertTenantOwnerPreference: jest.fn().mockResolvedValue({}),
    logConsentEvent: jest.fn().mockResolvedValue({}),
  };

  Object.assign(mocks, repoOverrides);

  jest.doMock('../../src/config/env', () => ({
    ...defaults,
    ...envOverrides,
  }));

  jest.doMock('twilio', () => ({
    validateRequest: jest.fn(() => true),
  }));

  jest.doMock('../../src/services/stripeService', () => ({
    handleWebhookEvent: jest.fn(),
  }));

  jest.doMock('../../src/services/emailInboxService', () => ({
    processInboundEmail: jest.fn(),
  }));

  jest.doMock('../../src/services/conversationService', () => ({
    handleInboundSms: mocks.handleInboundSms,
  }));

  jest.doMock('../../src/dal/userRepository', () => ({
    findByPhone: mocks.findByPhone,
    findByAwsSmsNumber: mocks.findByAwsSmsNumber,
    findByTwilioSmsNumber: mocks.findByTwilioSmsNumber,
    markEmailBounced: jest.fn(),
  }));

  jest.doMock('../../src/dal/tenantRepository', () => ({
    findByUserId: mocks.findByUserId,
  }));

  jest.doMock('../../src/dal/smsRepository', () => ({
    upsertTenantOwnerPreference: mocks.upsertTenantOwnerPreference,
    logConsentEvent: mocks.logConsentEvent,
  }));

  jest.doMock('../../src/dal/notificationRepository', () => ({
    findLogByExternalId: mocks.findLogByExternalId,
    createLogEntry: mocks.createLogEntry,
  }));

  const express = require('express');
  const router = require('../../src/routes/webhooks');

  const app = express();
  app.use(express.json({ type: '*/*' }));
  app.use('/api/v1/webhooks', router);

  return { app, mocks };
}

describe('AWS SMS webhook route', () => {
  test('returns 500 in production when AWS_SMS_WEBHOOK_SECRET is missing', async () => {
    const { app, mocks } = setup({
      envOverrides: { NODE_ENV: 'production', AWS_SMS_WEBHOOK_SECRET: '' },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/aws/sms')
      .send({});

    expect(res.status).toBe(500);
    expect(mocks.createLogEntry).not.toHaveBeenCalled();
  });

  test('returns 401 when secret is invalid', async () => {
    const { app, mocks } = setup();

    const res = await request(app)
      .post('/api/v1/webhooks/aws/sms')
      .set('x-webhook-secret', 'wrong-secret')
      .send({});

    expect(res.status).toBe(401);
    expect(mocks.createLogEntry).not.toHaveBeenCalled();
  });

  test('parses SNS Notification envelope and routes inbound message', async () => {
    const { app, mocks } = setup();

    const snsInner = buildAwsSnsMessage({
      messageBody: 'Need help with lease',
      inboundMessageId: 'inbound-xyz',
    });

    const res = await request(app)
      .post('/api/v1/webhooks/aws/sms')
      .set('x-webhook-secret', 'test-secret')
      .send({
        Type: 'Notification',
        Message: JSON.stringify(snsInner),
      });

    expect(res.status).toBe(200);
    expect(mocks.findLogByExternalId).toHaveBeenCalledWith('inbound-xyz');
    expect(mocks.createLogEntry).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: 'tenant-user-1',
      status: 'received',
      body: 'Need help with lease',
      externalId: 'inbound-xyz',
    }));
    expect(mocks.handleInboundSms).toHaveBeenCalledWith(expect.objectContaining({
      tenantUserId: 'tenant-user-1',
      landlordId: 'owner-1',
      content: 'Need help with lease',
      logEntryId: 'log-1',
      channel: 'sms',
    }));
  });

  test('dedupes by external id and does not create a second log', async () => {
    const { app, mocks } = setup({
      repoOverrides: {
        findLogByExternalId: jest.fn().mockResolvedValue({ id: 'existing-log' }),
      },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/aws/sms')
      .set('x-webhook-secret', 'test-secret')
      .send(buildAwsSnsMessage({ inboundMessageId: 'dup-msg-id' }));

    expect(res.status).toBe(200);
    expect(mocks.findLogByExternalId).toHaveBeenCalledWith('dup-msg-id');
    expect(mocks.createLogEntry).not.toHaveBeenCalled();
    expect(mocks.handleInboundSms).not.toHaveBeenCalled();
  });

  test('STOP message writes consent event and does not route to conversation AI', async () => {
    const { app, mocks } = setup();

    const res = await request(app)
      .post('/api/v1/webhooks/aws/sms')
      .set('x-webhook-secret', 'test-secret')
      .send(buildAwsSnsMessage({ messageBody: 'STOP', inboundMessageId: 'stop-msg-id' }));

    expect(res.status).toBe(200);
    expect(mocks.upsertTenantOwnerPreference).toHaveBeenCalledWith({
      tenantId: 'tenant-record-1',
      ownerId: 'owner-1',
      smsOptIn: false,
    });
    expect(mocks.logConsentEvent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-record-1',
      ownerId: 'owner-1',
      eventType: 'opt_out',
      messageId: 'stop-msg-id',
    }));
    expect(mocks.handleInboundSms).not.toHaveBeenCalled();
  });
});
