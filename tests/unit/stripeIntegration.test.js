const mockConstructEvent = jest.fn();

jest.mock('stripe', () => jest.fn(() => ({
  webhooks: { constructEvent: mockConstructEvent },
})));

jest.mock('../../src/config/env', () => ({
  STRIPE_SECRET_KEY: 'sk_test_platform',
  STRIPE_WEBHOOK_SECRET: 'whsec_platform',
  STRIPE_CONNECT_WEBHOOK_SECRET: '  whsec_connect  ',
}));

const { constructWebhookEvent } = require('../../src/integrations/stripe');

describe('constructWebhookEvent', () => {
  beforeEach(() => mockConstructEvent.mockReset());

  it('accepts an event signed by the connected-account webhook destination', () => {
    const connectEvent = { id: 'evt_connect', type: 'account.updated' };
    const signatureError = Object.assign(new Error('Invalid signature'), {
      type: 'StripeSignatureVerificationError',
    });

    mockConstructEvent
      .mockImplementationOnce(() => { throw signatureError; })
      .mockReturnValueOnce(connectEvent);

    expect(constructWebhookEvent(Buffer.from('{}'), 't=1,v1=signature')).toBe(connectEvent);
    expect(mockConstructEvent).toHaveBeenNthCalledWith(
      1,
      expect.any(Buffer),
      't=1,v1=signature',
      'whsec_platform',
    );
    expect(mockConstructEvent).toHaveBeenNthCalledWith(
      2,
      expect.any(Buffer),
      't=1,v1=signature',
      'whsec_connect',
    );
  });
});