import 'dotenv/config';
import { Worker } from 'bullmq';
import { QUEUE_NAMES } from './queues/queue-names';

// Layer processors
import { ingestionProcessor } from './processors/layer1/ingestion.processor';
import { embeddingProcessor, markEmbeddingFailed, EmbeddingJobData } from './processors/layer1/embedding.processor';
import { techniqueProcessor } from './processors/layer2/technique.processor';
import { testCaseGenerationProcessor } from './processors/layer3/test-case-generation.processor';
import { scriptGenerationProcessor } from './processors/layer3/script-generation.processor';
import { executionProcessor } from './processors/layer4/execution.processor';
import { resultClassifierProcessor } from './processors/layer5/result-classifier.processor';
import { selfHealingProcessor } from './processors/layer5/self-healing.processor';
import { reviewGateProcessor } from './processors/layer6/review-gate.processor';

import { logger } from './utils/logger';

// Pass plain connection options so BullMQ uses its own bundled ioredis
// rather than the top-level ioredis instance (avoids type mismatch).
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null as null,
};

const workers = [
  // Layer 1 - Ingestion & Knowledge
  new Worker(QUEUE_NAMES.INGESTION, ingestionProcessor, { connection, concurrency: 3 }),
  new Worker(QUEUE_NAMES.EMBEDDING, embeddingProcessor, { connection, concurrency: 5 }),

  // Layer 2 - Test Design
  new Worker(QUEUE_NAMES.TECHNIQUE_ANALYSIS, techniqueProcessor, { connection, concurrency: 2 }),

  // Layer 3 - Generation
  new Worker(QUEUE_NAMES.TEST_CASE_GENERATION, testCaseGenerationProcessor, { connection, concurrency: 2 }),
  new Worker(QUEUE_NAMES.SCRIPT_GENERATION, scriptGenerationProcessor, { connection, concurrency: 3 }),

  // Layer 4 - Execution
  new Worker(QUEUE_NAMES.EXECUTION, executionProcessor, { connection, concurrency: 5 }),

  // Layer 5 - Analysis & Self-Healing
  new Worker(QUEUE_NAMES.RESULT_CLASSIFICATION, resultClassifierProcessor, { connection, concurrency: 5 }),
  new Worker(QUEUE_NAMES.SELF_HEALING, selfHealingProcessor, { connection, concurrency: 2 }),

  // Layer 6 - Governance
  new Worker(QUEUE_NAMES.REVIEW_GATE_NOTIFICATION, reviewGateProcessor, { connection, concurrency: 3 }),
];

// ── Per-worker event hooks ─────────────────────────────────────────────────
workers.forEach((worker) => {
  worker.on('completed', (job) => logger.info(`✅ Job completed: ${job.name} [${job.id}]`));
  worker.on('error',     (err) => logger.error('Worker error:', err));

  worker.on('failed', (job, err) => {
    logger.error(`❌ Job failed: ${job?.name} [${job?.id}] - ${err.message}`);
  });
});

// ── Embedding worker — mark DB row as failed when all retries exhausted ─────
// BullMQ fires `failed` on every attempt failure; `job.attemptsMade` equals
// `job.opts.attempts` only on the final attempt, so we check that to avoid
// marking rows as permanently failed after a transient error.
const embeddingWorker = workers.find(
  (w) => (w as any).name === QUEUE_NAMES.EMBEDDING,
);
if (embeddingWorker) {
  embeddingWorker.on('failed', async (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      await markEmbeddingFailed(job.data as EmbeddingJobData, err.message);
    }
  });
}

logger.info(`🚀 Workers started: ${workers.length} queues listening`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});
