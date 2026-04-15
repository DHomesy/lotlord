/**
 * Shared MIME validation utilities.
 *
 * Detects the actual file type from magic bytes so a client cannot disguise
 * an executable/script as an image or PDF by lying about the Content-Type header.
 *
 * Returns a detected-type key, or null for content that cannot be identified
 * (plain text, CSV, etc.). Null means "accept on declared type" — callers must
 * still enforce an allow-list of declared MIME types separately.
 */

/**
 * Inspect the first bytes of a buffer and return a content-family string.
 *
 * @param {Buffer} buf
 * @returns {string|null}
 */
function detectRawMime(buf) {
  if (!buf || buf.length < 4) return null;

  // JPEG — FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';

  // PNG — 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';

  // GIF87a / GIF89a — 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';

  // WEBP — RIFF....WEBP
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';

  // PDF — %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';

  // OLE2 compound document (legacy .doc, .xls, .ppt) — D0 CF 11 E0 A1 B1 1A E1
  if (buf.length >= 8 &&
      buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0 &&
      buf[4] === 0xA1 && buf[5] === 0xB1 && buf[6] === 0x1A && buf[7] === 0xE1) return 'application/msword';

  // ZIP-based formats — PK\x03\x04 (covers DOCX, XLSX, PPTX, ODP, etc.)
  if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) return 'application/zip';

  // ISO Base Media File Format — 'ftyp' atom at offset 4 (MP4, MOV, M4A, M4V …)
  if (buf.length >= 8 &&
      buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video/isobmff';

  // QuickTime: some MOV files start with a 'moov' (6D 6F 6F 76) or 'wide' (77 69 64 65) box
  if (buf[0] === 0x6D && buf[1] === 0x6F && buf[2] === 0x6F && buf[3] === 0x76) return 'video/isobmff';
  if (buf[0] === 0x77 && buf[1] === 0x69 && buf[2] === 0x64 && buf[3] === 0x65) return 'video/isobmff';

  return null; // Unknown / plain text — accept on declared type
}

/**
 * Throw an HTTP 415 error if the file's actual binary content does not match
 * its declared MIME type.
 *
 * @param {Express.Multer.File} file  — multer file object (must have .buffer)
 * @param {Map<string, Set<string>>} allowedDeclaredForDetected
 *   Maps a detected content-family key back to the set of declared MIME types
 *   that are valid for it. If the detected key is not in the map the file is
 *   accepted transparently (unknown / future format).
 */
function assertMimeMatchesBytes(file, allowedDeclaredForDetected) {
  const detected = detectRawMime(file.buffer);
  if (detected === null) return; // Unrecognised — can't validate, accept on declared type

  const allowedDeclared = allowedDeclaredForDetected.get(detected);
  if (!allowedDeclared) return; // Detected family not covered by this context's map — skip

  if (!allowedDeclared.has(file.mimetype)) {
    const err = new Error('File content does not match declared type');
    err.status = 415;
    throw err;
  }
}

module.exports = { detectRawMime, assertMimeMatchesBytes };
