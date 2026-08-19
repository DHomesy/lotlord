const { query } = require('../config/db');

async function recordOutcome({ ownerId, intent, confidence, fallbackRecommended }) {
  await query(
    `INSERT INTO owner_qa_quality_metrics
       (owner_id, intent, confidence, fallback_recommended, bucket_date, sample_count)
     VALUES ($1, $2, $3, $4, CURRENT_DATE, 1)
     ON CONFLICT (owner_id, intent, confidence, fallback_recommended, bucket_date)
     DO UPDATE SET
       sample_count = owner_qa_quality_metrics.sample_count + 1,
       updated_at = NOW()`,
    [ownerId, intent, confidence, !!fallbackRecommended],
  );
}

module.exports = {
  recordOutcome,
};
