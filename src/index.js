require('dotenv').config();
const app = require('./app');
const { PORT } = require('./config/env');
const { connectDb } = require('./config/db');
const jobs = require('./jobs');

const port = PORT || 3000;

async function start() {
  await connectDb();
  jobs.init();

  app.listen(port, () => {
    console.log(`[server] Running on port ${port} (${process.env.NODE_ENV})`);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
