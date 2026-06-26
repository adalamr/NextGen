import { Job } from 'bullmq';
import { logger } from '../../utils/logger';
import { getPool } from '../../config/database.config';

export interface EmbeddingJobData {
  projectId: string;
  docType: string;
  docId: string;
  content: string;
  chunkIndex?: number;
  /**
   * When set, the processor updates embedding_status on this specific row.
   * Populated when an entry is created/updated via the direct KB CRUD API.
   * Not set for ingestion-pipeline jobs (those INSERT a new row).
   */
  knowledgeVectorId?: string;
  llmConfig: {
    /** Base URL of the OpenAI-compatible gateway, e.g. https://aihub-test-llm-gateway.aws.baxter.com/v1 */
    apiEndpoint: string;
    /** Bearer token */
    apiKey: string;
    /** Model name used for embeddings */
    modelName: string;
  };
}

export async function embeddingProcessor(job: Job<EmbeddingJobData>) {
  const { projectId, docType, docId, content, chunkIndex = 0, knowledgeVectorId, llmConfig } = job.data;
  const pool = getPool();

  logger.info(`Embedding job: docType=${docType}, docId=${docId}, chunk=${chunkIndex}, project=${projectId}`);

  if (!content?.trim()) {
    return { docId, chunkIndex, status: 'skipped', reason: 'empty_content' };
  }

  // ── Call OpenAI-compatible /embeddings endpoint ──────────────────────
  const embedUrl = `${llmConfig.apiEndpoint.replace(/\/$/, '')}/embeddings`;

  const embedRes = await fetch(embedUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${llmConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: llmConfig.modelName,
      input: content.slice(0, 8000),
    }),
  });

  if (!embedRes.ok) {
    const errText = await embedRes.text().catch(() => '');
    throw new Error(`Embedding API error ${embedRes.status}: ${errText.slice(0, 400)}`);
  }

  const embedJson = await embedRes.json() as any;
  const embedding: number[] = embedJson.data?.[0]?.embedding;

  if (!embedding || !embedding.length) {
    throw new Error(`No embedding returned for docId=${docId}, chunk=${chunkIndex}`);
  }

  // ── Persist the vector ────────────────────────────────────────────────────────
  if (knowledgeVectorId) {
    // Direct KB CRUD path — row already exists; update embedding + mark embedded
    await pool.query(
      `UPDATE knowledge_vectors
       SET embedding        = $1::vector,
           embedding_status = 'embedded',
           embedding_error  = NULL
       WHERE id = $2`,
      [JSON.stringify(embedding), knowledgeVectorId],
    );
  } else {
    // Ingestion-pipeline path — INSERT a new row (keeps legacy behaviour)
    await pool.query(
      `INSERT INTO knowledge_vectors
         (project_id, doc_type, doc_id, content, embedding, metadata, embedding_status)
       VALUES ($1, $2, $3, $4, $5::vector, $6, 'embedded')
       ON CONFLICT DO NOTHING`,
      [
        projectId,
        docType,
        docId,
        content,
        JSON.stringify(embedding),
        JSON.stringify({ chunkIndex, embeddedAt: new Date().toISOString() }),
      ],
    );
  }

  logger.info(`Embedding stored: docId=${docId}, chunk=${chunkIndex}, dims=${embedding.length}`);
  return { docId, chunkIndex, status: 'embedded', dims: embedding.length };
}

/**
 * Called by the worker host when a BullMQ job has exhausted all retry attempts.
 * Marks the knowledge_vectors row as `failed` so admins can see it in the list.
 * Only applies to direct-CRUD jobs (knowledgeVectorId present).
 */
export async function markEmbeddingFailed(jobData: EmbeddingJobData, errorMessage: string): Promise<void> {
  if (!jobData.knowledgeVectorId) return;
  const pool = getPool();
  try {
    await pool.query(
      `UPDATE knowledge_vectors
       SET embedding_status = 'failed',
           embedding_error  = $1
       WHERE id = $2`,
      [errorMessage.slice(0, 1000), jobData.knowledgeVectorId],
    );
    logger.info(`Embedding marked failed: knowledgeVectorId=${jobData.knowledgeVectorId}`);
  } catch (dbErr) {
    logger.error('Failed to persist embedding_status=failed:', dbErr);
  }
}
