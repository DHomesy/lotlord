#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { EmailStack } = require('../lib/email-stack');
const { SmsStack } = require('../lib/sms-stack');
const { StorageStack } = require('../lib/storage-stack');

const app = new cdk.App();

const VALID_STAGES = ['test', 'prod'];

function boolContext(name) {
  const raw = app.node.tryGetContext(name);
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') return raw.toLowerCase() === 'true';
  return false;
}

function envByStage(prefix, stage) {
  return process.env[`${prefix}_${stage.toUpperCase()}`] || '';
}

function normalizeApiBaseUrl(rawUrl) {
  const url = new URL(String(rawUrl || '').trim());
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error(`[infra] Invalid apiUrl protocol '${url.protocol}'. Use http(s).`);
  }
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (url.pathname.endsWith('/api/v1')) {
    url.pathname = url.pathname.slice(0, -('/api/v1'.length));
  }
  return url.toString().replace(/\/$/, '');
}

function resolveConfig() {
  const stage = String(
    app.node.tryGetContext('stage') || process.env.INFRA_STAGE || 'test',
  ).trim().toLowerCase();

  if (!VALID_STAGES.includes(stage)) {
    throw new Error(`[infra] Invalid stage '${stage}'. Expected one of: ${VALID_STAGES.join(', ')}`);
  }

  const perStage = app.node.tryGetContext('environments') || {};
  const stageConfig = perStage[stage] || {};

  const apiUrlRaw =
    app.node.tryGetContext('apiUrl') ||
    stageConfig.apiUrl ||
    envByStage('INFRA_API_URL', stage);

  const webhookSecret =
    app.node.tryGetContext('webhookSecret') ||
    stageConfig.webhookSecret ||
    envByStage('INFRA_WEBHOOK_SECRET', stage);

  if (!apiUrlRaw) {
    throw new Error(
      `[infra] Missing apiUrl for stage='${stage}'. ` +
      `Set --context apiUrl=..., context environments.${stage}.apiUrl in cdk.json, ` +
      `or env INFRA_API_URL_${stage.toUpperCase()}.`,
    );
  }
  if (!webhookSecret) {
    throw new Error(
      `[infra] Missing webhookSecret for stage='${stage}'. ` +
      `Set --context webhookSecret=..., context environments.${stage}.webhookSecret in cdk.json, ` +
      `or env INFRA_WEBHOOK_SECRET_${stage.toUpperCase()}.`,
    );
  }

  const apiUrl = normalizeApiBaseUrl(apiUrlRaw);
  const host = new URL(apiUrl).hostname;
  const allowEphemeralUrl = boolContext('allowEphemeralUrl');

  if (/ngrok\.io$|ngrok-free\.app$/i.test(host) && !allowEphemeralUrl) {
    throw new Error(
      `[infra] Refusing ephemeral ngrok apiUrl '${apiUrl}' for stage='${stage}'. ` +
      `Use a stable domain or pass --context allowEphemeralUrl=true for temporary testing only.`,
    );
  }

  if (stage === 'prod' && !apiUrl.startsWith('https://')) {
    throw new Error(`[infra] Production stage requires https apiUrl. Got '${apiUrl}'.`);
  }

  return { stage, apiUrl, webhookSecret };
}

const { stage, apiUrl, webhookSecret } = resolveConfig();
console.log(`[infra] Stage='${stage}' API_URL='${apiUrl}'`);

const awsEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region:  process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

// ── Email infrastructure (SES, SNS, SQS, Lambda) ─────────────────────────────
// Must be deployed in us-east-1 — SES inbound mail routing is only available there.
// Creates the shared API IAM user 'lotlord-api-ses' with SES send permissions.
new EmailStack(app, 'LotlordEmailStack', {
  env: { account: awsEnv.account, region: 'us-east-1' },
  description: 'LotLord email infrastructure — SES domain identity, inbound pipeline, bounce handling',
  apiUrl,
  webhookSecret,
});

// ── SMS infrastructure (AWS End User Messaging SMS + webhook plumbing) ───────
// Creates:
//   - SNS inbound topic subscribed to /api/v1/webhooks/aws/sms
//   - IAM role AWS SMS assumes for two-way publish
//   - SMS configuration set with SNS event destination
//   - Runtime IAM permissions on the shared API user
new SmsStack(app, 'LotlordSmsStack', {
  env: awsEnv,
  description: 'LotLord SMS infrastructure — two-way webhook channel and delivery telemetry plumbing',
  apiUrl,
  webhookSecret,
  apiUserName: 'lotlord-api-ses',
  configurationSetName: 'lotlord-sms-config-set',
});

// ── File storage (S3 bucket for documents and maintenance attachments) ─────────
// Reuses the same IAM user created by EmailStack ('lotlord-api-ses').
// Deploy EmailStack first so the user exists before this stack references it.
// After deploy, set S3_BUCKET_NAME in your API environment — no new credentials needed.
new StorageStack(app, 'LotlordStorageStack', {
  env: awsEnv,
  description: 'LotLord file storage — private S3 bucket for documents and maintenance attachments',
  apiUserName: 'lotlord-api-ses', // existing user from EmailStack
});
