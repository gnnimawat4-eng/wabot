require('dotenv').config();
const { createFlowWorker } = require('./flowWorker');
const { createBroadcastWorker } = require('./broadcastWorker');

const flowWorker = createFlowWorker();
const broadcastWorker = createBroadcastWorker();

console.log('WaBot workers started');

const shutdown = async () => {
  console.log('Shutting down workers...');
  await flowWorker.close();
  await broadcastWorker.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
