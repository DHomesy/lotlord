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
  // Scopes the httpOnly refresh-token cookie to a shared domain (e.g. .lotlord.app)
  // so www.* and api.* subdomains can both receive it. Leave unset in test/staging.
  COOKIE_DOMAIN: optional('COOKIE_DOMAIN'),
  // Refresh cookie policy knobs for cross-site deployments.
  // Use COOKIE_SAME_SITE=none when frontend and API are on different sites/domains.
  COOKIE_SAME_SITE: optional('COOKIE_SAME_SITE', 'lax'),
  // Optional explicit secure override. If omitted, secure follows NODE_ENV=production.
  // When COOKIE_SAME_SITE=none, secure is forced true by cookie config.
  COOKIE_SECURE: optional('COOKIE_SECURE'),

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

  // AWS SMS
  AWS_SMS_ORIGINATION_IDENTITY: optional('AWS_SMS_ORIGINATION_IDENTITY'),
  AWS_SMS_MESSAGE_TYPE: optional('AWS_SMS_MESSAGE_TYPE', 'TRANSACTIONAL'),
  AWS_SMS_CONFIGURATION_SET_NAME: optional('AWS_SMS_CONFIGURATION_SET_NAME'),
  AWS_SMS_NUMBER_TYPE: optional('AWS_SMS_NUMBER_TYPE', 'TOLL_FREE'),
  AWS_SMS_TWO_WAY_CHANNEL_ARN: optional('AWS_SMS_TWO_WAY_CHANNEL_ARN'),
  AWS_SMS_TWO_WAY_CHANNEL_ROLE_ARN: optional('AWS_SMS_TWO_WAY_CHANNEL_ROLE_ARN'),
  AWS_SMS_WEBHOOK_SECRET: optional('AWS_SMS_WEBHOOK_SECRET'),
  SMS_HELP_RESPONSE: optional('SMS_HELP_RESPONSE'),
  SMS_STOP_CONFIRMATION: optional('SMS_STOP_CONFIRMATION'),
  SMS_START_CONFIRMATION: optional('SMS_START_CONFIRMATION'),
  SMS_SEND_MAX_ATTEMPTS: optional('SMS_SEND_MAX_ATTEMPTS', '3'),
  SMS_CAP_AUTOPILOT: optional('SMS_CAP_AUTOPILOT', '1000'),
  SMS_CAP_PORTFOLIO: optional('SMS_CAP_PORTFOLIO', '2500'),
  SMS_AI_WARN_SEGMENTS: optional('SMS_AI_WARN_SEGMENTS', '3'),
  SMS_AI_BLOCK_SEGMENTS: optional('SMS_AI_BLOCK_SEGMENTS', '6'),

  // App
  APP_BASE_URL: optional('APP_BASE_URL', 'http://localhost:3000'),

  // Stripe
  STRIPE_SECRET_KEY:     optional('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: optional('STRIPE_WEBHOOK_SECRET'),
  // Stripe SaaS — one Price ID per paid plan tier (create in Stripe Dashboard → Products)
  // Use nickname 'autopilot' for Autopilot and 'portfolio' for Portfolio.
  STRIPE_PRICE_ID_AUTOPILOT:       optional('STRIPE_PRICE_ID_AUTOPILOT'),
  STRIPE_PRICE_ID_PORTFOLIO:       optional('STRIPE_PRICE_ID_PORTFOLIO'),

  // OpenAI
  OPENAI_API_KEY: optional('OPENAI_API_KEY'),
  AI_MODEL_DEFAULT: optional('AI_MODEL_DEFAULT', 'gpt-4o-mini'),
  AI_MODEL_HIGH_RISK: optional('AI_MODEL_HIGH_RISK', 'gpt-4o'),
  AI_MODEL_CLASSIFICATION: optional('AI_MODEL_CLASSIFICATION', 'gpt-4o-mini'),
  AI_ROUTE_FORCE_HIGH_RISK_ON_REVIEW: optional('AI_ROUTE_FORCE_HIGH_RISK_ON_REVIEW', 'true'),
  AI_ROUTE_MAX_HISTORY_BEFORE_ESCALATION: optional('AI_ROUTE_MAX_HISTORY_BEFORE_ESCALATION', '60'),
  AI_ROUTE_MAX_MESSAGE_LENGTH_BEFORE_ESCALATION: optional('AI_ROUTE_MAX_MESSAGE_LENGTH_BEFORE_ESCALATION', '1400'),
  AI_PROMPT_BUDGET_TENANT_TOKENS: optional('AI_PROMPT_BUDGET_TENANT_TOKENS', '1800'),
  AI_PROMPT_BUDGET_OWNER_QA_TOKENS: optional('AI_PROMPT_BUDGET_OWNER_QA_TOKENS', '2200'),
  AI_PROMPT_MAX_RECENT_TURNS: optional('AI_PROMPT_MAX_RECENT_TURNS', '20'),

  // Error alerting — email address to notify on 5xx errors and unhandled rejections
  ALERT_EMAIL: optional('ALERT_EMAIL'),
  // Optional dedicated destination for in-app bug reports (falls back to ALERT_EMAIL)
  BUG_REPORT_EMAIL: optional('BUG_REPORT_EMAIL'),
};
