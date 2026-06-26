import { Queue } from 'bullmq';
import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import { childLogger } from '../../../utils/logger';

const log = childLogger('layer1:knowledge-base');
import {
  LLMGateway,
  buildKnowledgeSearchPrompt,
  KnowledgeSearchResult,
} from '@platform/llm-gateway';

// ── Accepted `type` values (Tasks 1-3 AC-1) ──────────────────────────────────
// These are the canonical type identifiers used in the public API.
// They map 1-to-1 to the `doc_type` column in knowledge_vectors.
export const KB_ENTRY_TYPES = [
  'requirement',
  'test_case',
  'api',
  'page',
  'entity',
  'business_rule',
  'gold_standard_test_case',
  // Legacy / ingestion-pipeline values kept for backwards compatibility
  'REQUIREMENT',
  'DOC',
  'DEFECT',
  'INCIDENT',
  'TEST_RESULT',
  'DOCUMENT',
] as const;

export type KbEntryType = (typeof KB_ENTRY_TYPES)[number];

// ── Lazy embedding queue (instantiated once, reused) ─────────────────────────
let _embeddingQueue: Queue | null = null;
function getEmbeddingQueue(): Queue {
  if (!_embeddingQueue) {
    _embeddingQueue = new Queue('layer1:embedding', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null,
      },
    });
  }
  return _embeddingQueue;
}

/**
 * Layer 1 — Knowledge Base Service
 *
 * Manages the vector knowledge store (pgvector).
 *
 * CRUD flow (Tasks 1 & 2):
 *   POST  → INSERT row with embedding_status='PENDING', enqueue EMBEDDING job
 *   PUT   → UPDATE content/metadata, reset embedding_status='PENDING', re-enqueue
 *   GET   → list with embedding_status exposed
 *   DELETE → hard delete
 *
 * Search flow (Task 3):
 *   1. Convert query → embedding via Bedrock Titan
 *   2. pgvector cosine similarity → top-K chunks
 *   3. (optional) LLM re-rank and summarise → structured result
 *      skipped when skipRerank=true OR when the project has no LLM config
 */
export class KnowledgeBaseService {

  // ── LIST DOCUMENTS ────────────────────────────────────────────────────
  async listDocuments(
    projectId: string,
    filters: { docType?: string; search?: string; page?: number; limit?: number } = {},
  ) {
    log.info('listDocuments', { projectId, filters });
    const pool = getPool();
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['project_id = $1'];
    const params: unknown[] = [projectId];

    if (filters.docType) {
      params.push(filters.docType);
      conditions.push(`doc_type = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`content ILIKE $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const [rows, countRows] = await Promise.all([
      pool.query(
        `SELECT id, project_id, doc_type, doc_id, LEFT(content, 300) AS excerpt,
                metadata, embedding_status, embedding_error, created_at
         FROM knowledge_vectors
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      pool.query(`SELECT COUNT(*) FROM knowledge_vectors WHERE ${where}`, params),
    ]);

    return {
      documents: rows.rows.map(this.mapDocument),
      total: parseInt(countRows.rows[0].count, 10),
      page,
      limit,
    };
  }

  // ── CREATE ENTRY (Task 1 — AC-2, Task 2 — AC-1) ──────────────────────
  async createEntry(
    projectId: string,
    dto: {
      type: string;
      content: string;
      docId?: string;
      metadata?: Record<string, unknown>;
    },
    llmConfig?: { apiEndpoint: string; apiKey: string; modelName: string },
  ) {
    log.info('createEntry', { projectId, type: dto.type, docId: dto.docId, hasLlmConfig: !!llmConfig });
    if (!dto.content?.trim()) throw new ApiError(400, 'content must not be empty');

    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO knowledge_vectors
         (project_id, doc_type, doc_id, content, metadata, embedding_status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       RETURNING id, project_id, doc_type, doc_id,
                 LEFT(content, 300) AS excerpt,
                 metadata, embedding_status, embedding_error, created_at`,
      [
        projectId,
        dto.type,
        dto.docId || null,
        dto.content.trim(),
        JSON.stringify(dto.metadata || {}),
      ],
    );

    const entry = this.mapDocument(result.rows[0]);

    // Enqueue embedding job immediately (Task 2 — AC-1)
    if (llmConfig) {
      await this.enqueueEmbedding({
        knowledgeVectorId: entry.id,
        projectId,
        docType: dto.type,
        docId: dto.docId || entry.id,
        content: dto.content.trim(),
        llmConfig,
      });
      log.debug('createEntry: embedding job enqueued', { id: entry.id, projectId });
    } else {
      log.warn('createEntry: no LLM config — entry saved as PENDING (no embedding)', { id: entry.id, projectId });
    }

    return entry;
  }

  // ── UPDATE ENTRY (Task 1 — AC-2, Task 2 — AC-1) ──────────────────────
  async updateEntry(
    id: string,
    projectId: string,
    dto: {
      content?: string;
      metadata?: Record<string, unknown>;
    },
    llmConfig?: { apiEndpoint: string; apiKey: string; modelName: string },
  ) {
    log.info('updateEntry', { id, projectId, hasContent: !!dto.content, hasMetadata: !!dto.metadata });
    if (!dto.content && !dto.metadata) throw new ApiError(400, 'Provide content or metadata to update');

    const pool = getPool();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (dto.content !== undefined) {
      if (!dto.content.trim()) throw new ApiError(400, 'content must not be empty');
      values.push(dto.content.trim());
      updates.push(`content = $${values.length}`);
      // Reset status so the worker re-embeds the new content
      updates.push(`embedding_status = 'PENDING'`);
      updates.push(`embedding_error = NULL`);
    }
    if (dto.metadata !== undefined) {
      values.push(JSON.stringify(dto.metadata));
      updates.push(`metadata = $${values.length}`);
    }

    values.push(id);
    values.push(projectId);

    const result = await pool.query(
      `UPDATE knowledge_vectors
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND project_id = $${values.length}
       RETURNING id, project_id, doc_type, doc_id,
                 LEFT(content, 300) AS excerpt,
                 metadata, embedding_status, embedding_error, created_at`,
      values,
    );

    if (!result.rows.length) {
      log.warn('updateEntry: not found', { id, projectId });
      throw new ApiError(404, 'Entry not found');
    }
    const entry = this.mapDocument(result.rows[0]);

    // Re-enqueue embedding if content changed (Task 2 — AC-1)
    if (dto.content && llmConfig) {
      await this.enqueueEmbedding({
        knowledgeVectorId: entry.id,
        projectId,
        docType: entry.type,
        docId: entry.docId || entry.id,
        content: dto.content.trim(),
        llmConfig,
      });
      log.debug('updateEntry: re-embedding job enqueued', { id: entry.id, projectId });
    }

    return entry;
  }

  // ── DELETE DOCUMENT ───────────────────────────────────────────────────
  async deleteDocument(id: string, projectId: string) {
    log.info('deleteDocument', { id, projectId });
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM knowledge_vectors WHERE id = $1 AND project_id = $2 RETURNING id',
      [id, projectId],
    );
    if (!result.rows.length) {
      log.warn('deleteDocument: not found', { id, projectId });
      throw new ApiError(404, 'Document not found');
    }
    log.info('deleteDocument: deleted', { id, projectId });
    return { success: true, id };
  }

  // ── STATS ─────────────────────────────────────────────────────────────
  async getStats(projectId: string) {
    log.info('getStats', { projectId });
    const pool = getPool();

    const [total, byType, byStatus] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM knowledge_vectors WHERE project_id = $1', [projectId]),
      pool.query(
        `SELECT doc_type, COUNT(*) AS count
         FROM knowledge_vectors WHERE project_id = $1 GROUP BY doc_type`,
        [projectId],
      ),
      pool.query(
        `SELECT embedding_status, COUNT(*) AS count
         FROM knowledge_vectors WHERE project_id = $1 GROUP BY embedding_status`,
        [projectId],
      ),
    ]);

    return {
      totalChunks: parseInt(total.rows[0].count, 10),
      byDocType: Object.fromEntries(
        byType.rows.map((r: any) => [r.doc_type, parseInt(r.count, 10)]),
      ),
      byEmbeddingStatus: Object.fromEntries(
        byStatus.rows.map((r: any) => [r.embedding_status, parseInt(r.count, 10)]),
      ),
    };
  }

  // ── SEMANTIC SEARCH (Task 3) ──────────────────────────────────────────
  // skipRerank=true  → return raw vector results immediately (fast path, < 200 ms)
  // skipRerank=false → additionally call the LLM to re-rank and synthesise
  // If no llmConfig is supplied the method automatically falls back to skipRerank=true
  async search(
    projectId: string,
    query: string,
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string } | null,
    options: { topK?: number; docType?: string; skipRerank?: boolean } = {},
  ): Promise<KnowledgeSearchResult> {
    log.info('search', { projectId, queryLength: query.length, topK: options.topK, docType: options.docType, skipRerank: options.skipRerank });
    if (!llmConfig) {
      log.warn('search: no LLM config', { projectId });
      throw new ApiError(400, 'LLM config not set for this project. Configure it in Project Settings.');
    }

    const pool = getPool();
    const topK = options.topK || 10;
    const skipRerank = options.skipRerank === true;

    // Step 1: generate query embedding
    const queryEmbedding = await this.generateEmbedding(query, llmConfig);

    // Step 2: vector similarity search via pgvector
    const conditions = ['project_id = $1', 'embedding_status = \'embedded\''];
    const params: unknown[] = [projectId, JSON.stringify(queryEmbedding)];

    if (options.docType) {
      params.push(options.docType);
      conditions.push(`doc_type = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const vectorResult = await pool.query(
      `SELECT id, doc_type, doc_id, content, metadata,
              1 - (embedding <=> $2::vector) AS similarity
       FROM knowledge_vectors
       WHERE ${where}
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $${params.length + 1}`,
      [...params, topK],
    );

    if (!vectorResult.rows.length) {
      log.warn('search: no vector results', { projectId, query: query.slice(0, 80) });
      return {
        answer: 'No relevant information found in the knowledge base.',
        relevantChunks: [],
        confidence: 'LOW',
        suggestedFollowUps: [],
      };
    }

    const chunks = vectorResult.rows.map((row: any) => ({
      id: row.id,
      content: row.content,
      docType: row.doc_type,
      docId: row.doc_id || '',
      similarity: parseFloat(row.similarity),
      metadata: row.metadata || {},
    }));

    // Step 3 (fast path): skip LLM, return vector results directly
    if (skipRerank) {
      log.debug('search: fast path (skipRerank)', { projectId, chunks: chunks.length });
      return {
        answer: `Top ${chunks.length} results retrieved by vector similarity (re-rank skipped).`,
        relevantChunks: chunks.map((c) => ({
          id: c.id,
          docType: c.docType,
          docId: c.docId,
          relevanceScore: Math.round(c.similarity * 10),
          reason: `Vector cosine similarity: ${c.similarity.toFixed(3)}`,
          excerpt: c.content.slice(0, 300),
        })),
        confidence: chunks[0].similarity >= 0.8 ? 'HIGH' : chunks[0].similarity >= 0.5 ? 'MEDIUM' : 'LOW',
        suggestedFollowUps: [],
      };
    }

    // Step 3 (full path): LLM re-rank and summarise
    log.debug('search: full LLM re-rank path', { projectId, chunks: chunks.length });
    const gateway = new LLMGateway(llmConfig);
    const { systemPrompt, userPrompt } = buildKnowledgeSearchPrompt({
      query,
      topKChunks: chunks,
      maxResults: 5,
    });

    const result = await gateway.completeJSON<KnowledgeSearchResult>({ systemPrompt, userPrompt, config: llmConfig });
    return result;
  }

  // ── GOLD STANDARD — LIST CANDIDATES ────────────────────────────────────
  // Returns test cases with gold_standard_candidate=TRUE awaiting human approval.
  async listGoldStandardCandidates(projectId: string) {
    log.info('listGoldStandardCandidates', { projectId });
    const pool = getPool();
    const result = await pool.query(
      `SELECT tc.id, tc.title, tc.technique, tc.priority,
              tc.match_percentage, tc.gold_standard_candidate_at,
              tc.feedback_notes,
              u.first_name || ' ' || u.last_name AS created_by_name
       FROM test_cases tc
       LEFT JOIN users u ON u.id = tc.created_by
       WHERE tc.project_id = $1
         AND tc.gold_standard_candidate = TRUE
         AND (tc.is_gold_standard IS NULL OR tc.is_gold_standard = FALSE)
       ORDER BY tc.match_percentage DESC, tc.gold_standard_candidate_at DESC`,
      [projectId],
    );
    return result.rows;
  }

  // ── GOLD STANDARD — APPROVE ───────────────────────────────────────────
  // Human reviewer promotes a candidate to full gold standard.
  // Pushes the test case into knowledge_vectors with doc_type='gold_standard_test_case'
  // and enqueues an embedding job.
  async approveGoldStandard(
    testCaseId: string,
    projectId: string,
    reviewerId: string,
    llmConfig?: { apiEndpoint: string; apiKey: string; modelName: string },
  ) {
    log.info('approveGoldStandard', { testCaseId, projectId, reviewerId });
    const pool = getPool();

    const tcRow = await pool.query(
      `SELECT id, title, description, technique, priority, steps, expected_results,
              match_percentage, gold_standard_candidate, project_id
       FROM test_cases WHERE id = $1 AND project_id = $2`,
      [testCaseId, projectId],
    );
    if (!tcRow.rows.length) {
      log.warn('approveGoldStandard: test case not found', { testCaseId, projectId });
      throw new ApiError(404, 'Test case not found');
    }
    const tc = tcRow.rows[0];

    if (!tc.gold_standard_candidate) {
      log.warn('approveGoldStandard: not a candidate', { testCaseId, projectId });
      throw new ApiError(400, 'Test case is not a gold standard candidate. Submit feedback scoring ≥80% first.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Promote the test case
      await client.query(
        `UPDATE test_cases
         SET is_gold_standard          = TRUE,
             gold_standard_candidate   = FALSE,
             gold_standard_candidate_at = NULL,
             gold_standard_by          = $1,
             gold_standard_at          = NOW(),
             updated_at                = NOW()
         WHERE id = $2`,
        [reviewerId, testCaseId],
      );

      // 2. Build a rich text representation for the vector store
      const content = JSON.stringify({
        title:           tc.title,
        description:     tc.description,
        technique:       tc.technique,
        priority:        tc.priority,
        steps:           tc.steps,
        expectedResults: tc.expected_results,
        matchPercentage: tc.match_percentage,
      });

      // 3. Upsert into knowledge_vectors
      const kvResult = await client.query(
        `INSERT INTO knowledge_vectors
           (project_id, doc_type, doc_id, content, metadata, embedding_status)
         VALUES ($1, 'gold_standard_test_case', $2, $3, $4, 'PENDING')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          projectId,
          testCaseId,
          content,
          JSON.stringify({ testCaseId, approvedBy: reviewerId, approvedAt: new Date().toISOString() }),
        ],
      );

      await client.query('COMMIT');

      // 4. Enqueue embedding job (outside transaction)
      if (kvResult.rows.length && llmConfig) {
        await this.enqueueEmbedding({
          knowledgeVectorId: kvResult.rows[0].id,
          projectId,
          docType: 'gold_standard_test_case',
          docId: testCaseId,
          content,
          llmConfig,
        });
      }

      log.info('approveGoldStandard: approved', { testCaseId, projectId, reviewerId });
      return {
        testCaseId,
        isGoldStandard: true,
        approvedBy: reviewerId,
        message: 'Test case approved as Gold Standard and added to the knowledge base.',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      log.error('approveGoldStandard: rolled back', { testCaseId, projectId, err });
      throw err;
    } finally {
      client.release();
    }
  }

  // ── GOLD STANDARD — REVOKE ────────────────────────────────────────────
  // Removes gold standard status and deletes the vector entry.
  async revokeGoldStandard(
    testCaseId: string,
    projectId: string,
  ) {
    log.info('revokeGoldStandard', { testCaseId, projectId });
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE test_cases
         SET is_gold_standard          = FALSE,
             gold_standard_candidate   = FALSE,
             gold_standard_candidate_at = NULL,
             gold_standard_by          = NULL,
             gold_standard_at          = NULL,
             updated_at                = NOW()
         WHERE id = $1 AND project_id = $2
         RETURNING id`,
        [testCaseId, projectId],
      );
      if (!result.rows.length) {
        log.warn('revokeGoldStandard: not found', { testCaseId, projectId });
        throw new ApiError(404, 'Test case not found');
      }

      await client.query(
        `DELETE FROM knowledge_vectors
         WHERE doc_id = $1 AND doc_type = 'gold_standard_test_case'`,
        [testCaseId],
      );

      await client.query('COMMIT');
      log.info('revokeGoldStandard: revoked', { testCaseId, projectId });
      return { testCaseId, isGoldStandard: false, message: 'Gold Standard status revoked.' };
    } catch (err) {
      await client.query('ROLLBACK');
      log.error('revokeGoldStandard: rolled back', { testCaseId, projectId, err });
      throw err;
    } finally {
      client.release();
    }
  }

  // ── GOLD STANDARD — TOP-3 FEW-SHOT EXAMPLES ──────────────────────────
  // Called by the test case generation service before building the LLM prompt.
  // Returns the top 3 gold standard test cases most similar to the query text.
  // Falls back to highest match_percentage if no embeddings available.
  async getTopGoldStandardExamples(
    projectId: string,
    queryText: string,
    llmConfig?: { apiEndpoint: string; apiKey: string; modelName: string },
    topK = 3,
  ): Promise<Array<{ title: string; technique: string; steps: unknown; expectedResults: unknown; matchPercentage: number }>> {
    const pool = getPool();

    if (llmConfig) {
      try {
        // Semantic similarity path
        const queryEmbedding = await this.generateEmbedding(queryText, llmConfig);
        const result = await pool.query(
          `SELECT tc.id, tc.title, tc.technique, tc.steps, tc.expected_results, tc.match_percentage
           FROM test_cases tc
           JOIN knowledge_vectors kv
             ON kv.doc_id  = tc.id::text
            AND kv.doc_type = 'gold_standard_test_case'
            AND kv.project_id = $1
            AND kv.embedding IS NOT NULL
           WHERE tc.project_id = $1
             AND tc.is_gold_standard = TRUE
           ORDER BY kv.embedding <=> $2::vector
           LIMIT $3`,
          [projectId, JSON.stringify(queryEmbedding), topK],
        );
        if (result.rows.length) return result.rows.map(this.mapGoldStandardExample);
      } catch (err) {
        log.warn('getTopGoldStandardExamples: pgvector semantic query failed, falling back to non-semantic sort', {
          projectId, error: String(err),
        });
      }
    }

    // Non-semantic fallback: highest match_percentage
    const fallback = await pool.query(
      `SELECT id, title, technique, steps, expected_results, match_percentage
       FROM test_cases
       WHERE project_id = $1 AND is_gold_standard = TRUE
       ORDER BY match_percentage DESC NULLS LAST
       LIMIT $2`,
      [projectId, topK],
    );
    return fallback.rows.map(this.mapGoldStandardExample);
  }

  // ── STORE DOCUMENT CHUNK (called by ingestion worker) ─────────────────
  // Kept for backwards-compatibility with the ingestion pipeline.
  async storeChunk(dto: {
    projectId: string;
    docType: string;
    docId: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO knowledge_vectors
         (project_id, doc_type, doc_id, content, embedding, metadata, embedding_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'embedded')
       RETURNING id`,
      [
        dto.projectId,
        dto.docType,
        dto.docId,
        dto.content,
        JSON.stringify(dto.embedding),
        JSON.stringify(dto.metadata || {}),
      ],
    );
    return result.rows[0];
  }

  // ── GENERATE EMBEDDING (Bedrock Titan) ───────────────────────────────
  async generateEmbedding(
    text: string,
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string },
  ): Promise<number[]> {
    const embedUrl = `${llmConfig.apiEndpoint.replace(/\/$/, '')}/embeddings`;

    const res = await fetch(embedUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: llmConfig.modelName,
        input: text.slice(0, 8000),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Embedding API error ${res.status}: ${errText.slice(0, 400)}`);
    }

    const json = await res.json() as any;
    const embedding: number[] = json.data?.[0]?.embedding;

    if (!embedding?.length) {
      throw new Error('Gateway returned no embedding vector');
    }
    return embedding;
  }

  // ── REEMBED PENDING (admin utility — used after bulk SQL seed) ───────────
  // Finds all rows with embedding_status = 'PENDING' for a project,
  // enqueues an embedding job for each, and returns a count.
  async reembedPending(
    projectId: string,
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string },
  ): Promise<{ enqueued: number }> {
    log.info('reembedPending', { projectId });
    const pool = getPool();

    const result = await pool.query(
      `SELECT id, doc_type, doc_id, content
       FROM knowledge_vectors
       WHERE project_id = $1 AND embedding_status = 'PENDING'
       ORDER BY created_at ASC`,
      [projectId],
    );

    let enqueued = 0;
    for (const row of result.rows) {
      await this.enqueueEmbedding({
        knowledgeVectorId: row.id,
        projectId,
        docType:  row.doc_type,
        docId:    row.doc_id || row.id,
        content:  row.content,
        llmConfig,
      });
      enqueued++;
    }

    log.info('reembedPending: jobs enqueued', { projectId, enqueued });
    return { enqueued };
  }

  // ── ENQUEUE EMBEDDING JOB (internal helper) ───────────────────────────
  private async enqueueEmbedding(opts: {    knowledgeVectorId: string;
    projectId: string;
    docType: string;
    docId: string;
    content: string;
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string };
  }) {
    log.debug('enqueueEmbedding', { knowledgeVectorId: opts.knowledgeVectorId, docType: opts.docType, projectId: opts.projectId });
    const queue = getEmbeddingQueue();
    await queue.add(
      `embed-direct-${opts.knowledgeVectorId}`,
      {
        projectId: opts.projectId,
        docType: opts.docType,
        docId: opts.docId,
        content: opts.content,
        chunkIndex: 0,
        // knowledgeVectorId lets the worker update status on the exact row
        knowledgeVectorId: opts.knowledgeVectorId,
        llmConfig: {
          apiEndpoint: opts.llmConfig.apiEndpoint,
          apiKey: opts.llmConfig.apiKey,
          modelName: opts.llmConfig.modelName,
        },
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
  }

  // ── GOLD STANDARD EXAMPLE MAPPER ────────────────────────────────────────
  private mapGoldStandardExample(row: any) {
    return {
      title:           row.title,
      technique:       row.technique,
      steps:           row.steps,
      expectedResults: row.expected_results,
      matchPercentage: row.match_percentage ?? 0,
    };
  }

  // ── MAPPER ────────────────────────────────────────────────────────────
  private mapDocument(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      // Expose as `type` (public API name) — also keep docType as alias
      type: row.doc_type,
      docType: row.doc_type,
      docId: row.doc_id,
      excerpt: row.excerpt,
      metadata: row.metadata,
      embeddingStatus: row.embedding_status ?? 'PENDING',
      embeddingError: row.embedding_error ?? null,
      createdAt: row.created_at,
    };
  }
}
