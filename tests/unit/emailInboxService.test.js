/**
 * Unit tests for src/services/emailInboxService.js
 *
 * All external dependencies are mocked — no DB, SES, or conversation service calls.
 * Run: npm run test:unit
 */

jest.mock('../../src/config/db');
jest.mock('../../src/dal/userRepository');
jest.mock('../../src/dal/notificationRepository');
jest.mock('../../src/services/conversationService');
jest.mock('uuid', () => ({ v4: jest.fn(() => 'log-entry-uuid') }));

const { query }              = require('../../src/config/db');
const userRepo               = require('../../src/dal/userRepository');
const notificationRepo       = require('../../src/dal/notificationRepository');
const conversationService    = require('../../src/services/conversationService');
const { processInboundEmail } = require('../../src/services/emailInboxService');

// ── Shared test fixtures ──────────────────────────────────────────────────────

const SENDER_USER_ID  = 'sender-user-uuid';
const CONV_ID         = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockSender = {
  id:         SENDER_USER_ID,
  email:      'tenant@example.com',
  first_name: 'Ten',
  last_name:  'Ant',
};

const mockLogEntry = {
  id:          'log-entry-uuid',
  recipient_id: SENDER_USER_ID,
  channel:     'email',
  status:      'received',
};

function makeMsg({
  messageId  = 'msg-id-001@mail.example.com',
  fromEmail  = 'tenant@example.com',
  from       = 'Tenant Name <tenant@example.com>',
  subject    = 'About my lease',
  text       = 'Hello, I have a question.',
  html       = '',
  inReplyTo  = null,
} = {}) {
  return { messageId, fromEmail, from, subject, text, html, inReplyTo };
}

beforeEach(() => {
  jest.clearAllMocks();

  // Default: message has NOT been processed before
  query.mockResolvedValue({ rows: [] });

  // Default: sender is known
  userRepo.findByEmail.mockResolvedValue(mockSender);

  // Default: log entry created successfully
  notificationRepo.createLogEntry.mockResolvedValue(mockLogEntry);

  // Default: conversationService.handleInboundEmail is a no-op
  conversationService.handleInboundEmail = jest.fn().mockResolvedValue(undefined);
});

// ── Deduplication ─────────────────────────────────────────────────────────────

describe('deduplication', () => {
  test('returns null and skips processing when messageId already exists in notifications_log', async () => {
    query.mockResolvedValue({ rows: [{ id: 'existing-log-id' }] });

    const result = await processInboundEmail(makeMsg());

    expect(result).toBeNull();
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
    expect(notificationRepo.createLogEntry).not.toHaveBeenCalled();
    expect(conversationService.handleInboundEmail).not.toHaveBeenCalled();
  });
});

// ── Unknown sender ────────────────────────────────────────────────────────────

describe('unknown sender', () => {
  test('returns null and skips logging when sender email is not found', async () => {
    userRepo.findByEmail.mockResolvedValue(null);

    const result = await processInboundEmail(makeMsg());

    expect(result).toBeNull();
    expect(notificationRepo.createLogEntry).not.toHaveBeenCalled();
    expect(conversationService.handleInboundEmail).not.toHaveBeenCalled();
  });
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('happy path', () => {
  test('returns the log entry on success', async () => {
    const result = await processInboundEmail(makeMsg());
    expect(result).toEqual(mockLogEntry);
  });

  test('creates a notifications_log entry with correct fields', async () => {
    const msg = makeMsg({ subject: 'Broken heater', text: 'It stopped working.' });
    await processInboundEmail(msg);

    expect(notificationRepo.createLogEntry).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: SENDER_USER_ID,
      channel:     'email',
      status:      'received',
      subject:     'Broken heater',
      body:        'It stopped working.',
      externalId:  msg.messageId,
    }));
  });

  test('stores inReplyTo as threadId in the log entry', async () => {
    const msg = makeMsg({ inReplyTo: '<some-previous-message@mail.example.com>' });
    await processInboundEmail(msg);

    expect(notificationRepo.createLogEntry).toHaveBeenCalledWith(expect.objectContaining({
      threadId: '<some-previous-message@mail.example.com>',
    }));
  });

  test('stores null threadId when inReplyTo is absent', async () => {
    const msg = makeMsg({ inReplyTo: null });
    await processInboundEmail(msg);

    expect(notificationRepo.createLogEntry).toHaveBeenCalledWith(expect.objectContaining({
      threadId: null,
    }));
  });

  test('hands off to conversationService with sender userId and email channel', async () => {
    await processInboundEmail(makeMsg({ text: 'My tap is leaking.' }));

    expect(conversationService.handleInboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      tenantUserId: SENDER_USER_ID,
      channel:      'email',
      content:      'My tap is leaking.',
      logEntryId:   'log-entry-uuid',
    }));
  });
});

// ── F2 conversation threading via CONV_ID_RE ──────────────────────────────────

describe('F2 email threading — conversationId extraction', () => {
  test('extracts conversationId from In-Reply-To containing a conversation Message-ID', async () => {
    const inReplyTo = `<conv-${CONV_ID}-1716000000000@lotlord.app>`;
    await processInboundEmail(makeMsg({ inReplyTo }));

    expect(conversationService.handleInboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: CONV_ID,
    }));
  });

  test('passes undefined conversationId when inReplyTo is null', async () => {
    await processInboundEmail(makeMsg({ inReplyTo: null }));

    const callArgs = conversationService.handleInboundEmail.mock.calls[0][0];
    expect(callArgs.conversationId).toBeUndefined();
  });

  test('passes undefined conversationId when inReplyTo contains no UUID pattern', async () => {
    await processInboundEmail(makeMsg({ inReplyTo: '<plain-thread-id@mail.example.com>' }));

    const callArgs = conversationService.handleInboundEmail.mock.calls[0][0];
    expect(callArgs.conversationId).toBeUndefined();
  });

  test('passes undefined conversationId when inReplyTo has conv- prefix but malformed UUID', async () => {
    // "conv-" prefix present but UUID is too short — regex must not match
    await processInboundEmail(makeMsg({ inReplyTo: '<conv-not-a-real-uuid@lotlord.app>' }));

    const callArgs = conversationService.handleInboundEmail.mock.calls[0][0];
    expect(callArgs.conversationId).toBeUndefined();
  });

  test('is case-insensitive when matching the UUID in In-Reply-To', async () => {
    // Regex uses /i flag — upper-case hex digits in UUID must still match.
    // The captured group preserves original casing (no normalization in the service).
    const upperUUID = CONV_ID.toUpperCase();
    const inReplyTo = `<conv-${upperUUID}-1716000000000@lotlord.app>`;
    await processInboundEmail(makeMsg({ inReplyTo }));

    expect(conversationService.handleInboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: upperUUID,
    }));
  });
});

// ── HTML fallback ─────────────────────────────────────────────────────────────

describe('HTML fallback', () => {
  test('uses plain text when provided', async () => {
    const msg = makeMsg({ text: 'Plain text body.', html: '<p>HTML body.</p>' });
    await processInboundEmail(msg);

    expect(conversationService.handleInboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Plain text body.',
    }));
  });

  test('strips HTML tags and uses resulting text when no plain-text part is available', async () => {
    const msg = makeMsg({ text: '', html: '<p>Hello <b>world</b>.</p>' });
    await processInboundEmail(msg);

    expect(conversationService.handleInboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Hello world .',
    }));
  });
});
