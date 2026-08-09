const cdk = require('aws-cdk-lib');
const ses = require('aws-cdk-lib/aws-ses');
const sesActions = require('aws-cdk-lib/aws-ses-actions');
const s3 = require('aws-cdk-lib/aws-s3');
const s3n = require('aws-cdk-lib/aws-s3-notifications');
const sqs = require('aws-cdk-lib/aws-sqs');
const sns = require('aws-cdk-lib/aws-sns');
const iam = require('aws-cdk-lib/aws-iam');
const lambda = require('aws-cdk-lib/aws-lambda');
const lambdaNodejs = require('aws-cdk-lib/aws-lambda-nodejs');
const lambdaEventSources = require('aws-cdk-lib/aws-lambda-event-sources');
const path = require('path');

class EmailStack extends cdk.Stack {
  /**
   * @param {import('constructs').Construct} scope
   * @param {string} id
   * @param {{ apiUrl: string, webhookSecret: string, domainName?: string } & import('aws-cdk-lib').StackProps} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const domainName = props.domainName ?? 'lotlord.app';

    // ─────────────────────────────────────────────────────────────────────────
    // 1. SES Domain Identity + DKIM
    // ─────────────────────────────────────────────────────────────────────────
    // Verifies lotlord.app with SES and provisions DKIM signing keys.
    // CDK outputs the three DKIM CNAME records you must add in Squarespace.
    const domainIdentity = new ses.EmailIdentity(this, 'DomainIdentity', {
      identity: ses.Identity.domain(domainName),
      // EASY_DKIM is the default — SES generates 2048-bit RSA keys automatically
    });

    // Output the three DKIM records for Squarespace.
    // Note: descriptions cannot contain CloudFormation tokens — values are in the output Value field.
    domainIdentity.dkimRecords.forEach((record, i) => {
      new cdk.CfnOutput(this, `DkimRecord${i + 1}`, {
        value: `${record.name}  CNAME  ${record.value}`,
        description: `DKIM CNAME record ${i + 1} — add to Squarespace DNS as a CNAME record`,
      });
    });

    new cdk.CfnOutput(this, 'SpfRecord', {
      value: '"v=spf1 include:amazonses.com ~all"',
      description: 'SPF — add TXT record: Host = @, Value above',
    });

    new cdk.CfnOutput(this, 'MxRecord', {
      value: `10 inbound-smtp.${this.region}.amazonaws.com`,
      description: 'MX — add MX record: Host = @, Priority = 10, Value above',
    });

    new cdk.CfnOutput(this, 'DmarcRecord', {
      value: '"v=DMARC1; p=quarantine; rua=mailto:dmarc@lotlord.app"',
      description: 'DMARC — add TXT record: Host = _dmarc, Value above',
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. SES Configuration Set (attaches bounce/complaint event routing)
    // ─────────────────────────────────────────────────────────────────────────
    const configSet = new ses.CfnConfigurationSet(this, 'ConfigSet', {
      name: 'lotlord-config-set',
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. SNS Topic for bounce and complaint notifications
    // ─────────────────────────────────────────────────────────────────────────
    const bounceComplaintTopic = new sns.Topic(this, 'BounceComplaintTopic', {
      topicName: 'ses-bounce-complaints',
      displayName: 'SES Bounce & Complaint Notifications',
    });

    // Route bounce + complaint events from the config set to SNS
    new ses.CfnConfigurationSetEventDestination(this, 'BounceEventDestination', {
      configurationSetName: configSet.ref,
      eventDestination: {
        name: 'bounce-complaint-sns',
        enabled: true,
        matchingEventTypes: ['bounce', 'complaint'],
        snsDestination: { topicArn: bounceComplaintTopic.topicArn },
      },
    });

    // HTTPS subscription — SNS will POST to /api/v1/webhooks/ses/bounce
    // SNS sends a SubscriptionConfirmation first; the API handler auto-confirms it.
    // The ?secret= query param is verified by the handler so only requests originating
    // from this SNS topic (which know the URL) are processed.
    new sns.CfnSubscription(this, 'BounceWebhookSub', {
      topicArn: bounceComplaintTopic.topicArn,
      protocol: 'https',
      endpoint: `${props.apiUrl}/api/v1/webhooks/ses/bounce?secret=${encodeURIComponent(props.webhookSecret)}`,
    });

    new cdk.CfnOutput(this, 'BounceComplaintTopicArn', {
      value: bounceComplaintTopic.topicArn,
      description: 'SNS topic ARN for SES bounce/complaints — set as SES_BOUNCE_SNS_ARN (informational)',
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. S3 Bucket — stores raw inbound .eml files
    // ─────────────────────────────────────────────────────────────────────────
    // Emails are retained for 30 days then automatically purged.
    const inboundBucket = new s3.Bucket(this, 'InboundEmailBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{ expiration: cdk.Duration.days(30) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // SES service principal must have s3:PutObject on this bucket
    inboundBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowSESPut',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
        actions: ['s3:PutObject'],
        resources: [`${inboundBucket.bucketArn}/emails/*`],
        conditions: {
          StringEquals: { 'AWS:SourceAccount': this.account },
        },
      }),
    );

    new cdk.CfnOutput(this, 'InboundBucketName', {
      value: inboundBucket.bucketName,
      description: 'S3 bucket for SES inbound raw emails — set as SES_INBOUND_BUCKET',
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. SQS Queue + DLQ — buffers inbound email events
    // ─────────────────────────────────────────────────────────────────────────
    const inboundDlq = new sqs.Queue(this, 'InboundDlq', {
      queueName: 'ses-inbound-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const inboundQueue = new sqs.Queue(this, 'InboundQueue', {
      queueName: 'ses-inbound-queue',
      // Must be >= Lambda timeout (60 s) to prevent double-processing
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: { queue: inboundDlq, maxReceiveCount: 3 },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // S3 notifies SQS whenever a new email object is created
    inboundBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(inboundQueue),
      { prefix: 'emails/' },
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Lambda — reads email from S3, parses it, POSTs to the API
    // ─────────────────────────────────────────────────────────────────────────
    const inboundProcessor = new lambdaNodejs.NodejsFunction(this, 'InboundProcessor', {
      functionName: 'ses-inbound-processor',
      description: 'Reads raw SES inbound emails from S3, parses them, and forwards to the API webhook',
      entry: path.join(__dirname, '../lambda/ses-inbound/index.js'),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        API_URL: props.apiUrl,
        WEBHOOK_SECRET: props.webhookSecret,
      },
      bundling: {
        // Use local esbuild rather than Docker (Docker Desktop not required)
        forceDockerBundling: false,
        // AWS SDK v3 is available in the Node.js 20 Lambda runtime — do not bundle it
        externalModules: ['@aws-sdk/*'],
        // Bundle mailparser and all its transitive dependencies
        nodeModules: ['mailparser'],
      },
    });

    // Allow Lambda to read inbound emails from S3
    inboundBucket.grantRead(inboundProcessor);

    // SQS triggers the Lambda (batch of up to 5 messages)
    inboundProcessor.addEventSource(
      new lambdaEventSources.SqsEventSource(inboundQueue, {
        batchSize: 5,
        // Report partial failures so unprocessable messages go to the DLQ
        reportBatchItemFailures: true,
      }),
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 7. SES Receipt Rule Set + Rule
    // ─────────────────────────────────────────────────────────────────────────
    // Matches all @lotlord.app addresses and stores emails to S3.
    //
    // IMPORTANT: After deploying, you must activate this rule set in the
    // SES console (Email receiving → Rule sets → Select → Set as active), or via CLI:
    //   aws ses set-active-receipt-rule-set --rule-set-name lotlord-ruleset --region us-east-1
    const ruleSet = new ses.ReceiptRuleSet(this, 'RuleSet', {
      receiptRuleSetName: 'lotlord-ruleset',
    });

    ruleSet.addRule('CatchAllRule', {
      // Empty recipients array = match ALL @lotlord.app addresses
      recipients: [],
      actions: [
        new sesActions.S3({
          bucket: inboundBucket,
          objectKeyPrefix: 'emails/',
        }),
      ],
      enabled: true,
      scanEnabled: true,
    });

    new cdk.CfnOutput(this, 'ReceiptRuleSetActivation', {
      value: `aws ses set-active-receipt-rule-set --rule-set-name lotlord-ruleset --region us-east-1`,
      description: 'Run this AWS CLI command after deploy to activate inbound mail routing',
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 8. IAM User for the API server (Railway does not have an IAM role)
    // ─────────────────────────────────────────────────────────────────────────
    // The API server needs ses:SendEmail. Create a dedicated IAM user with
    // least-privilege permissions and generate access keys for Railway env vars.
    //
    // SECURITY NOTE: The secret access key is output in CloudFormation (visible in
    // AWS console). Copy it immediately after deploy and treat it as a secret.
    // Do not commit the value to source control.
    const apiUser = new iam.User(this, 'ApiSesUser', {
      userName: 'lotlord-api-ses',
    });

    apiUser.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowSendEmail',
        effect: iam.Effect.ALLOW,
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'ses:FromAddress': [
              `noreply@${domainName}`,
              `reply@${domainName}`,
              `support@${domainName}`,
            ],
          },
        },
      }),
    );

    const accessKey = new iam.CfnAccessKey(this, 'ApiSesUserKey', {
      userName: apiUser.userName,
    });

    new cdk.CfnOutput(this, 'ApiSesAccessKeyId', {
      value: accessKey.ref,
      description: 'AWS_ACCESS_KEY_ID — set in Railway environment variables',
    });

    new cdk.CfnOutput(this, 'ApiSesSecretAccessKey', {
      value: accessKey.attrSecretAccessKey,
      description: 'AWS_SECRET_ACCESS_KEY — set in Railway environment variables (treat as a secret, copy immediately)',
    });
  }
}

module.exports = { EmailStack };
