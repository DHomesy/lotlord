const cdk = require('aws-cdk-lib');
const sns = require('aws-cdk-lib/aws-sns');
const iam = require('aws-cdk-lib/aws-iam');
const smsvoice = require('aws-cdk-lib/aws-smsvoice');

class SmsStack extends cdk.Stack {
  /**
   * @param {import('constructs').Construct} scope
   * @param {string} id
   * @param {{ apiUrl: string, webhookSecret: string, apiUserName?: string, configurationSetName?: string } & import('aws-cdk-lib').StackProps} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const apiUserName = props.apiUserName ?? 'lotlord-api-ses';
    const configurationSetName = props.configurationSetName ?? 'lotlord-sms-config-set';

    // Topic used as the two-way inbound channel for SMS messages.
    const inboundTopic = new sns.Topic(this, 'SmsInboundTopic', {
      topicName: 'lotlord-sms-inbound',
      displayName: 'LotLord inbound SMS messages',
    });

    // Topic for outbound delivery event telemetry from AWS End User Messaging SMS.
    const eventTopic = new sns.Topic(this, 'SmsEventTopic', {
      topicName: 'lotlord-sms-events',
      displayName: 'LotLord SMS delivery events',
    });

    // End User Messaging SMS assumes this role to publish inbound messages into SNS.
    const twoWayChannelRole = new iam.Role(this, 'SmsTwoWayChannelRole', {
      roleName: 'lotlord-sms-two-way-channel-role',
      assumedBy: new iam.ServicePrincipal('sms-voice.amazonaws.com'),
      description: 'Allows AWS End User Messaging SMS to publish inbound events to the LotLord SNS topic',
    });

    twoWayChannelRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowPublishInboundSmsToSns',
        effect: iam.Effect.ALLOW,
        actions: ['sns:Publish'],
        resources: [inboundTopic.topicArn],
      }),
    );

    // Route inbound SNS payloads into the API webhook. The API auto-confirms subscription.
    // Uses query-secret auth because SNS does not send custom headers.
    new sns.CfnSubscription(this, 'SmsInboundWebhookSubscription', {
      topicArn: inboundTopic.topicArn,
      protocol: 'https',
      endpoint: `${props.apiUrl}/api/v1/webhooks/aws/sms?secret=${encodeURIComponent(props.webhookSecret)}`,
    });

    // SMS configuration set used by outbound sends for delivery telemetry.
    new smsvoice.CfnConfigurationSet(this, 'SmsConfigurationSet', {
      configurationSetName,
      eventDestinations: [
        {
          enabled: true,
          eventDestinationName: 'lotlord-sms-events-sns',
          matchingEventTypes: ['ALL'],
          snsDestination: { topicArn: eventTopic.topicArn },
        },
      ],
    });

    // Reuse the existing API IAM user and grant runtime SMS API permissions.
    const apiUser = iam.User.fromUserName(this, 'ImportedApiUserForSms', apiUserName);
    apiUser.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'AllowSmsRuntimeOps',
        effect: iam.Effect.ALLOW,
        actions: [
          'sms-voice:SendTextMessage',
          'sms-voice:RequestPhoneNumber',
          'sms-voice:ReleasePhoneNumber',
          'sms-voice:DescribePhoneNumbers',
          'sms-voice:PutKeyword',
          'sms-voice:DeleteKeyword',
        ],
        resources: ['*'],
      }),
    );

    new cdk.CfnOutput(this, 'SmsInboundTopicArn', {
      value: inboundTopic.topicArn,
      description: 'Set as AWS_SMS_TWO_WAY_CHANNEL_ARN in the API environment',
    });

    new cdk.CfnOutput(this, 'SmsTwoWayChannelRoleArn', {
      value: twoWayChannelRole.roleArn,
      description: 'Set as AWS_SMS_TWO_WAY_CHANNEL_ROLE_ARN in the API environment',
    });

    new cdk.CfnOutput(this, 'SmsConfigurationSetName', {
      value: configurationSetName,
      description: 'Set as AWS_SMS_CONFIGURATION_SET_NAME in the API environment',
    });

    new cdk.CfnOutput(this, 'SmsEventTopicArn', {
      value: eventTopic.topicArn,
      description: 'SNS topic receiving outbound SMS delivery telemetry',
    });
  }
}

module.exports = { SmsStack };
