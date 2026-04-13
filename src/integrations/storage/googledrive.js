/**
 * Storage integration — Google Drive API
 * ---------------------------------------
 * Current:  Google Drive (MVP) — 15GB free, easy OAuth2
 * Future:   Swap this file for integrations/storage/s3.js — no other code changes needed.
 *
 * Setup:
 *  1. Reuse the same Google Cloud OAuth2 credentials as Gmail (same project)
 *  2. Enable the Google Drive API in Google Cloud Console
 *  3. Use GOOGLE_DRIVE_FOLDER_ID to scope all uploads to a shared folder
 *  4. Share that folder with anyone who needs access via the Drive UI
 */

const { google } = require('googleapis');
const { Readable } = require('stream');
const env = require('../../config/env');

function getDriveClient() {
  const auth = new google.auth.OAuth2(
    env.GOOGLE_DRIVE_CLIENT_ID,
    env.GOOGLE_DRIVE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
}

/**
 * Upload a file to Google Drive.
 * @param {Object} opts
 * @param {Buffer|string} opts.buffer    - File contents
 * @param {string}        opts.fileName  - Desired file name
 * @param {string}        opts.mimeType  - e.g. 'application/pdf', 'image/jpeg'
 * @returns {Promise<{ fileId: string, fileUrl: string }>}
 */
async function uploadFile({ buffer, fileName, mimeType }) {
  const drive = getDriveClient();
  const stream = Readable.from(buffer);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [env.GOOGLE_DRIVE_FOLDER_ID],
    },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
  });

  const { id: fileId, webViewLink: fileUrl } = response.data;
  return { fileId, fileUrl };
}

/**
 * Delete a file from Google Drive by its file ID.
 * @param {string} fileId
 */
async function deleteFile(fileId) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}

module.exports = { uploadFile, deleteFile };
