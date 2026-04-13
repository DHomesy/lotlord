/**
 * Email integration entry point.
 * All callers import from here — they never touch ses.js directly.
 * To swap providers in the future, change the require() below.
 */
module.exports = require('./ses');
// Future: module.exports = require('./ses-bulk'); — if SQS outbound queue is added
