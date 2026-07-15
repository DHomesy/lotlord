const GSM_7BIT_CHARS = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\\ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ`¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED_CHARS = '^{}\\[~]|€';

function isGsm7(str) {
  for (const ch of str) {
    if (GSM_7BIT_CHARS.includes(ch)) continue;
    if (GSM_EXTENDED_CHARS.includes(ch)) continue;
    return false;
  }
  return true;
}

function gsmLength(str) {
  let len = 0;
  for (const ch of str) {
    len += GSM_EXTENDED_CHARS.includes(ch) ? 2 : 1;
  }
  return len;
}

function estimateSmsSegments(message = '') {
  const text = String(message || '');
  if (!text) return 0;

  if (isGsm7(text)) {
    const len = gsmLength(text);
    if (len <= 160) return 1;
    return Math.ceil(len / 153);
  }

  // UCS-2 fallback for non-GSM characters
  const len = [...text].length;
  if (len <= 70) return 1;
  return Math.ceil(len / 67);
}

module.exports = { estimateSmsSegments };
