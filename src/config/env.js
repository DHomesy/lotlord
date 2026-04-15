/**
 * Central environment variable config.
 * Import this instead of using process.env directly throughout the app —
 * makes it easy to validate required vars at startup and swap values later.
 */

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const optional = (key, fallback = '') => process.env[key] || fallback;

module.exports = {
  PORT: optional('PORT', '3000'),
  NODE_ENV: optional('NODE_ENV', 'development'),

  // Database
  DATABASE_URL: required('DATABASE_URL'),

  // Auth
  JWT_SECRET: required('JWT_SECRET'),
  // Optional separate secret for refresh tokens. Falls back to JWT_SECRET + '_refresh' so
  // existing deployments continue working without a new environment variable.
  // Set JWT_REFRESH_SECRET in Railway to use a fully independent secret.
  JWT_REFRESH_SECRET: optional('JWT_REFRESH_SECRET', '') || undefined,
  JWT_EXPIRES_IN:         optional('JWT_EXPIRES_IN', '15m'),          // access token
  JWT_REFRESH_EXPIRES_IN: optional('JWT_REFRESH_EXPIRES_IN', '30d'),  // refresh token (httpOnly cookie)

  // Frontend
  // Used for CORS allowed-origin in production. Comma-separate multiple origins.
  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:5173'),

  // AWS SES — outbound email
  // AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are standard SDK env vars;
  // the SDK picks them up automatically — no need to reference them here.
  AWS_REGION:               optional('AWS_REGION', 'us-east-1'),
  SES_FROM_ADDRESS:         optional('SES_FROM_ADDRESS', 'noreply@lotlord.app'),
  SES_REPLY_TO_ADDRESS:     optional('SES_REPLY_TO_ADDRESS', 'reply@lotlord.app'),
  SES_CONFIGURATION_SET:    optional('SES_CONFIGURATION_SET', 'lotlord-config-set'),
  // Shared secret verified by POST /api/v1/webhooks/ses (set by CDK, passed to Lambda)
  SES_WEBHOOK_SECRET:       optional('SES_WEBHOOK_SECRET'),

  // AWS S3 — file storage (documents, maintenance attachments)
  S3_BUCKET_NAME: optional('S3_BUCKET_NAME', 'lotlord-files'),

  // Twilio
  TWILIO_ACCOUNT_SID: optional('TWILIO_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN: optional('TWILIO_AUTH_TOKEN'),
  TWILIO_PHONE_NUMBER: optional('TWILIO_PHONE_NUMBER'),

  // App
  APP_BASE_URL: optional('APP_BASE_URL', 'http://localhost:3000'),

  // Stripe
  STRIPE_SECRET_KEY:     optional('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: optional('STRIPE_WEBHOOK_SECRET'),
  // Stripe SaaS — monthly plan Price ID (create in Stripe Dashboard → Products → Add Product)
  STRIPE_PRICE_ID: optional('STRIPE_PRICE_ID'),

  // OpenAI
  OPENAI_API_KEY: optional('OPENAI_API_KEY'),

  // Error alerting — email address to notify on 5xx errors and unhandled rejections
  ALERT_EMAIL: optional('ALERT_EMAIL'),
};
