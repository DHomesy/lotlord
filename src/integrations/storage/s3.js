/**
 * Storage integration — AWS S3
 * ----------------------------
 * Replaces googledrive.js. All document and maintenance attachment storage
 * goes through this module. Access to files is controlled via short-lived
 * pre-signed URLs — files are never publicly accessible directly.
 *
 * Required env vars:
 *   AWS_REGION          — e.g. "us-east-1"  (picked up by SDK automatically)
 *   AWS_ACCESS_KEY_ID   — IAM key with s3:PutObject, s3:DeleteObject, s3:GetObject
 *   AWS_SECRET_ACCESS_KEY
 *   S3_BUCKET_NAME      — the private bucket created by the StorageStack CDK stack
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const env = require('../../config/env');
const { v4: uuidv4 } = require('uuid');

const s3Client = new S3Client({ region: env.AWS_REGION || 'us-east-1' });

/**
 * Upload a file to S3.
 * Stores under a random key so URLs are not guessable.
 * @param {Object} opts
 * @param {Buffer} opts.buffer    - File contents
 * @param {string} opts.fileName  - Original file name (stored as metadata only)
 * @param {string} opts.mimeType  - e.g. 'application/pdf', 'image/jpeg'
 * @param {string} [opts.folder]  - Optional key prefix, e.g. 'maintenance', 'documents'
 * @returns {Promise<{ fileId: string, fileUrl: string }>}
 *   fileId  — the S3 object key (use for deletion and generating download URLs)
 *   fileUrl — the S3 key (storage reference, NOT a public URL)
 */
async function uploadFile({ buffer, fileName, mimeType, folder = 'uploads' }) {
  const ext = fileName ? fileName.split('.').pop().toLowerCase() : 'bin';
  const key = `${folder}/${uuidv4()}.${ext}`;

  await s3Client.send(new PutObjectCommand({
    Bucket:      env.S3_BUCKET_NAME,
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
    Metadata: {
      originalName: encodeURIComponent(fileName || ''),
    },
  }));

  // fileUrl stores the S3 key. callers generate a pre-signed URL when needed (see getDownloadUrl).
  return { fileId: key, fileUrl: key };
}

/**
 * Delete a file from S3 by its object key.
 * @param {string} fileId - the S3 object key returned by uploadFile
 */
async function deleteFile(fileId) {
  await s3Client.send(new DeleteObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key:    fileId,
  }));
}

/**
 * Generate a pre-signed GET URL for secure, time-limited downloads.
 * @param {string} fileId    - S3 object key
 * @param {number} [expiresIn=3600] - URL lifetime in seconds (default 1 hour)
 * @returns {Promise<string>} pre-signed URL
 */
async function getDownloadUrl(fileId, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key:    fileId,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

module.exports = { uploadFile, deleteFile, getDownloadUrl };
