const cdk = require('aws-cdk-lib');
const s3 = require('aws-cdk-lib/aws-s3');
const iam = require('aws-cdk-lib/aws-iam');

/**
 * StorageStack — creates the private S3 bucket used for all user-generated files:
 *   • Documents uploaded by landlords/tenants
 *   • Maintenance request photo attachments
 *
 * Access model:
 *   - Bucket is fully private (no public ACLs)
 *   - The existing API IAM user (created by EmailStack) is granted S3 read/write.
 *     This means the same AWS credentials already set on your API server also
 *     cover S3 — no new key pair to manage or rotate.
 *   - Frontend receives short-lived pre-signed GET URLs from the API (never direct access)
 *
 * Props:
 *   apiUserName {string}  — IAM username of the existing API user to grant bucket access.
 *                           Defaults to 'lotlord-api-ses' (created by EmailStack).
 *   bucketName? {string}  — Optional explicit bucket name; omit to let CDK auto-generate.
 *
 * Outputs:
 *   BucketName — set as S3_BUCKET_NAME in your API environment.
 *   No new access key outputs — reuse the credentials from the EmailStack deploy.
 */
class StorageStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // ── Private S3 Bucket ────────────────────────────────────────────────────
    const bucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: props.bucketName ?? undefined,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      // Lifecycle: transition to Infrequent Access after 90 days to reduce storage costs
      lifecycleRules: [
        {
          id: 'ia-transition',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN, // never auto-delete user files on stack destroy
    });

    // ── Reuse the existing API IAM user from EmailStack ───────────────────────
    // Import by name — no cross-stack CloudFormation dependency, stacks remain
    // independently deployable. The user must exist (i.e. EmailStack deployed first).
    const apiUserName = props.apiUserName ?? 'lotlord-api-ses';
    const apiUser = iam.User.fromUserName(this, 'ImportedApiUser', apiUserName);

    // Grant the existing user full read/write access on this bucket.
    // CDK attaches an inline IAM policy to the user for these S3 actions.
    bucket.grantReadWrite(apiUser);

    // ── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'S3 bucket name — set as S3_BUCKET_NAME in your API environment',
    });

    new cdk.CfnOutput(this, 'BucketRegion', {
      value: this.region,
      description: 'Confirm this matches your AWS_REGION env var',
    });

    new cdk.CfnOutput(this, 'ApiUserNote', {
      value: apiUserName,
      description: 'Bucket access granted to this existing IAM user — reuse its credentials (no new key pair needed)',
    });
  }
}

module.exports = { StorageStack };
