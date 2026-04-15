const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { version } = require('../package.json');
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');
const { query: dbQuery } = require('./config/db');

// Route imports — uncomment as each module is built
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const propertyRoutes = require('./routes/properties');
const unitRoutes = require('./routes/units');
const tenantRoutes = require('./routes/tenants');
const leaseRoutes = require('./routes/leases');
const chargeRoutes  = require('./routes/charges');
const paymentRoutes = require('./routes/payments');
const ledgerRoutes  = require('./routes/ledger');
const maintenanceRoutes = require('./routes/maintenance');
const documentRoutes = require('./routes/documents');
const notificationRoutes = require('./routes/notifications');
const webhookRoutes = require('./routes/webhooks');
const aiRoutes = require('./routes/ai');
const invitationRoutes = require('./routes/invitations');
const analyticsRoutes  = require('./routes/analytics');
const billingRoutes    = require('./routes/billing');
const auditRoutes      = require('./routes/audit');

const app = express();

// Trust the first proxy in front of the app (e.g. nginx, AWS ALB).
// Required so req.ip reflects the real client IP for rate limiting and audit logs.
app.set('trust proxy', 1);

// Security & parsing middleware
app.use(helmet());

// Health check — registered before CORS so Railway's deploy probe (which sends
// Origin: <service-domain>) is never gated by the browser-origin allowlist.
// No auth required.
app.get('/health', async (req, res) => {
  let dbStatus = 'connected';
  try {
    await dbQuery('SELECT 1');
  } catch {
    dbStatus = 'error';
  }
  const status = dbStatus === 'connected' ? 'ok' : 'degraded';
  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status,
    db: dbStatus,
    version,
    uptime: Math.floor(process.uptime()),
  });
});

// CORS — allow credentials so the httpOnly refresh cookie travels with cross-origin requests.
// FRONTEND_URL must be set in production (e.g. https://www.lotlord.app).
// In development, Vite proxies /api to Express so CORS is not actually exercised.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser requests (Postman, cURL) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));

app.use(cookieParser());
// Raw body needed for Stripe webhook signature verification — must come before json()
app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limiting — applied before routes
// Auth routes: strict to prevent brute-force attacks on login/forgot-password
app.use('/api/v1/auth', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 100000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
}));
// All other API routes: general limit
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 100000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
}));

// Routes
app.use('/api/v1/auth', authRoutes);

// Email verification gate — applied globally to all non-auth API routes.
// Peeks at the Bearer token (already signed with emailVerified claim by signToken).
// Auth routes are excluded so resend-verification and verify-email always work.
// Unauthenticated requests pass through here and fail at the route-level authenticate middleware.
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config/env');
app.use('/api/v1', (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.split(' ')[1], JWT_SECRET);
    if (payload.role === 'landlord' && !payload.emailVerified) {
      return res.status(403).json({
        error: 'Please verify your email address before accessing this feature.',
        code: 'EMAIL_UNVERIFIED',
      });
    }
  } catch { /* invalid/expired token — handled by authenticate() in the route handler */ }
  next();
});

app.use('/api/v1/users', userRoutes);
app.use('/api/v1/properties', propertyRoutes);
app.use('/api/v1/units', unitRoutes);
app.use('/api/v1/tenants', tenantRoutes);
app.use('/api/v1/invitations', invitationRoutes);
app.use('/api/v1/leases', leaseRoutes);
app.use('/api/v1/charges', chargeRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/ledger', ledgerRoutes);
app.use('/api/v1/maintenance', maintenanceRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/audit', auditRoutes);

// 404 & global error handler — must be last
app.use(notFound);
app.use(errorHandler);

module.exports = app;