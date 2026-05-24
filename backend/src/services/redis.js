const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const flowStepsQueue = new Queue('flow-steps', { connection: redis });
const broadcastsQueue = new Queue('broadcasts', { connection: redis });

module.exports = { redis, flowStepsQueue, broadcastsQueue };
