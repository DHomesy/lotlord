#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { EmailStack } = require('../lib/email-stack');
const { SmsStack } = require('../lib/sms-stack');
const { StorageStack } = require('../lib/storage-stack');

const app = new cdk.App();

// Required context — pass via CLI:
//   cdk deploy \
//     --context apiUrl=https://your-app.railway.app \
//     --context webhookSecret=<random-secret>
const apiUrl = app.node.tryGetContext('apiUrl') ?? 'http://localhost:3000';
const webhookSecret = app.node.tryGetContext('webhookSecret') ?? '';

if (!webhookSecret) {
  console.warn(
    '\n[infra] WARNING: webhookSecret context not set.\n' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
    'Then deploy with: cdk deploy --context apiUrl=<url> --context webhookSecret=<secret>\n',
  );
}

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
