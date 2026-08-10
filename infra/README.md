# LotLord Infrastructure (AWS CDK)

Infra Docs Baseline: app release 1.14.3

This directory contains AWS infrastructure-as-code for LotLord using CDK v2.

It is designed to make SES, S3, and AWS SMS setup reproducible with minimal manual console work.

## Stacks

- LotlordEmailStack
  - SES domain identity + DKIM outputs
  - SES inbound pipeline: SES -> S3 -> SQS -> Lambda -> API webhook
  - SES bounce/complaint SNS topic -> API webhook subscription
  - Shared API IAM user `lotlord-api-ses` + access key outputs

- LotlordSmsStack
  - SNS topic for inbound two-way SMS events
  - SNS HTTPS subscription to `/api/v1/webhooks/aws/sms`
  - IAM role for AWS SMS service to publish inbound events to SNS
  - AWS SMS configuration set with event destination to SNS
  - Runtime IAM permissions for the shared API user (send/provision/release/keyword ops)

- LotlordStorageStack
  - Private S3 bucket for files (documents/maintenance attachments)
  - Grants read/write to the shared API IAM user

## Prerequisites

- Node.js 20+
- AWS CLI authenticated to target account
- CDK bootstrapped in target account/region

```bash
cd infra
npm install
npx cdk bootstrap aws://<account-id>/<region>
```

## Context Values

CDK app uses context values for webhook wiring:

- `stage` (optional): `test` (default) or `prod`
- `apiUrl` (required): public API base URL, e.g. `https://your-api.railway.app`
- `webhookSecret` (required): shared secret used in webhook subscriptions

Guardrails in `bin/infra.js` now prevent silent bad deploys:
- No fallback to `http://localhost:3000`
- Stage config must provide both `apiUrl` and `webhookSecret`
- `ngrok` domains are blocked unless you explicitly pass `--context allowEphemeralUrl=true`
- `prod` requires `https://` URLs

`apiUrl` is normalized automatically:
- Trailing slashes are removed
- `/api/v1` suffix is stripped if provided

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deploy

### Recommended test/prod setup

Use environment variables per stage so redeploys are deterministic:

```bash
# test
export INFRA_STAGE=test
export INFRA_API_URL_TEST=https://api-test.yourdomain.com
export INFRA_WEBHOOK_SECRET_TEST=<secret>

# prod
export INFRA_STAGE=prod
export INFRA_API_URL_PROD=https://api.yourdomain.com
export INFRA_WEBHOOK_SECRET_PROD=<secret>
```

You can also keep stage values in `cdk.json` under `context.environments.test/prod`.

### 1) Synthesize

```bash
cd infra
npm run synth -- --context apiUrl=https://your-api.railway.app --context webhookSecret=<secret>

# or stage-based
npm run synth -- --context stage=test
```

### 2) Deploy all stacks

```bash
npm run deploy -- --context apiUrl=https://your-api.railway.app --context webhookSecret=<secret>

# or stage-based
npm run deploy -- --context stage=test
npm run deploy -- --context stage=prod
```

Or deploy individually:

```bash
npx cdk deploy LotlordEmailStack --context apiUrl=https://your-api.railway.app --context webhookSecret=<secret>
npx cdk deploy LotlordSmsStack --context apiUrl=https://your-api.railway.app --context webhookSecret=<secret>
npx cdk deploy LotlordStorageStack
```

## Output -> App Environment Mapping

Set these in your API service environment (Railway or equivalent):

Core AWS
- `AWS_REGION` = target AWS region
- `AWS_ACCESS_KEY_ID` = `ApiSesAccessKeyId` output (Email stack)
- `AWS_SECRET_ACCESS_KEY` = `ApiSesSecretAccessKey` output (Email stack)

Email
- `SES_WEBHOOK_SECRET` = same value used for `webhookSecret` context
- `SES_FROM_ADDRESS` = verified identity (e.g. `noreply@lotlord.app`)
- `SES_REPLY_TO_ADDRESS` = reply address (e.g. `reply@lotlord.app`)
- `SES_CONFIGURATION_SET` = `lotlord-config-set` (or your configured value)

Storage
- `S3_BUCKET_NAME` = `BucketName` output (Storage stack)

SMS
- `AWS_SMS_WEBHOOK_SECRET` = same value used for `webhookSecret` context
- `AWS_SMS_CONFIGURATION_SET_NAME` = `SmsConfigurationSetName` output (SMS stack)
- `AWS_SMS_TWO_WAY_CHANNEL_ARN` = `SmsInboundTopicArn` output (SMS stack)
- `AWS_SMS_TWO_WAY_CHANNEL_ROLE_ARN` = `SmsTwoWayChannelRoleArn` output (SMS stack)
- `AWS_SMS_NUMBER_TYPE` = `TOLL_FREE` (default) or your approved type
- `AWS_SMS_MESSAGE_TYPE` = `TRANSACTIONAL`
- Optional fallback sender: `AWS_SMS_ORIGINATION_IDENTITY`

## Runtime Behavior Notes

- Inbound AWS SMS webhook endpoint: `POST /api/v1/webhooks/aws/sms`
- App validates webhook auth via either header or query secret:
  - Header: `x-webhook-secret`
  - Query: `?secret=...` (used by SNS subscription)
- New provisioned dedicated numbers are auto-wired for two-way inbound if both are set:
  - `AWS_SMS_TWO_WAY_CHANNEL_ARN`
  - `AWS_SMS_TWO_WAY_CHANNEL_ROLE_ARN`

## Post-Deploy Checks

1. SMS stack
- Confirm SNS subscription is `Confirmed` for inbound webhook
- Confirm IAM role exists: `lotlord-sms-two-way-channel-role`
- Confirm configuration set exists: `lotlord-sms-config-set`

2. App health
- Verify API starts with new env vars
- Trigger test outbound SMS
- Send inbound test message and confirm `/api/v1/webhooks/aws/sms` ingestion

3. Email stack
- Add DKIM/SPF/MX/DMARC records from outputs
- Activate SES receipt rule set (if not active)

## What Is Still Manual

These are provider/compliance steps not fully automatable by CDK:

- AWS SMS account readiness (sandbox exit where applicable)
- Regulatory registrations/approvals for your origination type
- Domain DNS changes (DKIM/SPF/MX/DMARC)

## Troubleshooting

- Deploy failed with ngrok URL blocked
  - Use a stable domain for `apiUrl`, or pass `--context allowEphemeralUrl=true` only for temporary local testing.

- Deploy failed for missing config
  - Provide `apiUrl` and `webhookSecret` via context flags or stage env vars (`INFRA_API_URL_TEST/PROD`, `INFRA_WEBHOOK_SECRET_TEST/PROD`).

- 401 on `/webhooks/aws/sms`
  - `AWS_SMS_WEBHOOK_SECRET` mismatch with deployment context `webhookSecret`

- Provisioning works but no inbound messages
  - `AWS_SMS_TWO_WAY_CHANNEL_ARN` / `AWS_SMS_TWO_WAY_CHANNEL_ROLE_ARN` not set in API env
  - SNS subscription not confirmed

- Outbound send fails with access denied
  - API IAM credentials missing or policy not updated

- SES inbound not processing
  - SES receipt rule set not active
  - Lambda/webhook secret mismatch
  - Lambda `API_URL` points at stale/ephemeral host from a previous deploy

## Useful Commands

```bash
# Diff infra changes
npm run diff -- --context apiUrl=https://your-api.railway.app --context webhookSecret=<secret>

# Destroy (careful)
npm run destroy
```
