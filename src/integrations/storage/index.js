/**
 * Storage integration entry point — AWS S3.
 * All callers import from here; they never touch s3.js or googledrive.js directly.
 */
module.exports = require('./s3');
