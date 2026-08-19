const rateLimit = require('express-rate-limit');

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const WINDOW_MS = toPositiveInt(process.env.OWNER_QA_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);

function ownerQaKey(req, scope) {
  const actor = req.user?.sub || req.user?.id || req.ip || 'unknown';
  return `${scope}:${actor}`;
}

const ownerQaPortalSnapshotLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: process.env.NODE_ENV === 'test'
    ? 100000
    : toPositiveInt(process.env.OWNER_QA_PORTAL_SNAPSHOT_RATE_LIMIT, 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ownerQaKey(req, 'owner-qa-portal-snapshot'),
  message: { error: 'Too many owner AI snapshot requests. Please try again shortly.' },
});

const ownerQaConversationActionLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: process.env.NODE_ENV === 'test'
    ? 100000
    : toPositiveInt(process.env.OWNER_QA_ACTION_SNAPSHOT_RATE_LIMIT, 40),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ownerQaKey(req, 'owner-qa-conversation-action'),
  skip: (req) => String(req.body?.action || '').toLowerCase() !== 'owner_qa_snapshot',
  message: { error: 'Too many owner AI snapshot actions. Please try again shortly.' },
});

const ownerQaSupervisorActionLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: process.env.NODE_ENV === 'test'
    ? 100000
    : toPositiveInt(process.env.OWNER_QA_SUPERVISOR_SNAPSHOT_RATE_LIMIT, 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ownerQaKey(req, 'owner-qa-supervisor-action'),
  skip: (req) => String(req.body?.action || '').toLowerCase() !== 'owner_qa_snapshot',
  message: { error: 'Too many owner AI supervisor snapshot actions. Please try again shortly.' },
});

module.exports = {
  ownerQaPortalSnapshotLimiter,
  ownerQaConversationActionLimiter,
  ownerQaSupervisorActionLimiter,
};
