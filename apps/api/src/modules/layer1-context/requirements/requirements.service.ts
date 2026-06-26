import { Queue } from 'bullmq';
import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import { childLogger } from '../../../utils/logger';

const log = childLogger('layer1:requirements');

// ── Lazy embedding queue (same queue the KB service uses) ─────────────────
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
 * Layer 1 — Requirements Service
 * CRUD + import for requirements.
 * Supports: plain text paste, CSV import, and manual entry.
 * Each requirement is scoped to a project.
 *
 * External ID format: REQ-{PROJECT_SLUG_UPPER}-{seq:03d}
 *   e.g. REQ-IVA-001, REQ-DEMO-042
 * Lookup by :reqId accepts both UUID (id) and external_id.
 */
export class RequirementsService {

  // ── EXTERNAL ID GENERATION ────────────────────────────────────────────
  // Calls the PL/pgSQL function added in Migration 004.
  // project slug is normalised: lowercase, non-alphanum → hyphen, max 10 chars.
  private async generateExternalId(projectId: string, client: any): Promise<string> {
    // Fetch slug from projects table
    const projResult = await client.query(
      'SELECT slug FROM projects WHERE id = $1',
      [projectId],
    );
    if (!projResult.rows.length) throw new ApiError(404, 'Project not found');
    const slug = (projResult.rows[0].slug as string)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '-')
      .slice(0, 10);

    // Atomically get the next sequence value for this project
    const seqResult = await client.query(
      'SELECT next_requirement_seq($1) AS seq',
      [projectId],
    );
    const seq: number = seqResult.rows[0].seq;
    return `REQ-${slug}-${String(seq).padStart(3, '0')}`;
  }

  // ── DUAL-KEY LOOKUP HELPER ────────────────────────────────────────────
  // Accepts either a UUID (id) or an external_id string.
  // Returns the internal UUID, or throws 404.
  async resolveRequirementId(reqId: string, projectId: string): Promise<string> {
    log.debug('resolveRequirementId', { reqId, projectId });
    const pool = getPool();
    const result = await pool.query(
      `SELECT id FROM requirements
       WHERE project_id = $1 AND (id::text = $2 OR external_id = $2)
       LIMIT 1`,
      [projectId, reqId],
    );
    if (!result.rows.length) {
      log.warn('resolveRequirementId: not found', { reqId, projectId });
      throw new ApiError(404, 'Requirement not found');
    }
    return result.rows[0].id as string;
  }

  // ── LIST ─────────────────────────────────────────────────────────────
  async getRequirements(
    projectId: string,
    filters: {
      page?: number;
      limit?: number;
      status?: string;
      priority?: string;
      search?: string;
    } = {},
  ) {
    log.info('getRequirements', { projectId, filters });
    const pool = getPool();
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['r.project_id = $1'];
    const params: unknown[] = [projectId];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (filters.priority) {
      params.push(filters.priority);
      conditions.push(`r.priority = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
    }

    const where = conditions.join(' AND ');

    // Join with trace_links to get coverage status
    const result = await pool.query(
      `SELECT
         r.id, r.project_id, r.title, r.description, r.source,
         r.external_id, r.priority, r.status, r.metadata,
         r.created_at, r.updated_at,
         COUNT(DISTINCT tl.target_id) AS test_case_count,
         CASE
           WHEN COUNT(DISTINCT tl.target_id) = 0 THEN 'NOT_COVERED'
           WHEN COUNT(DISTINCT tl.target_id) < 2   THEN 'PARTIAL'
           ELSE 'COVERED'
         END AS coverage_status
       FROM requirements r
       LEFT JOIN trace_links tl
         ON tl.source_id = r.id::text
        AND tl.source_type = 'REQUIREMENT'
        AND tl.target_type = 'TEST_CASE'
       WHERE ${where}
       GROUP BY r.id, r.project_id, r.title, r.description, r.source,
                r.external_id, r.priority, r.status, r.metadata,
                r.created_at, r.updated_at
       ORDER BY r.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM requirements r WHERE ${where}`,
      params,
    );

    return {
      requirements: result.rows.map(this.mapRequirement),
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
    };
  }

  // ── GET ONE ──────────────────────────────────────────────────────────
  // reqId may be a UUID or an external_id (e.g. REQ-IVA-001)
  async getRequirement(reqId: string, projectId: string) {
    log.info('getRequirement', { reqId, projectId });
    const pool = getPool();
    const result = await pool.query(
      `SELECT
         r.id, r.project_id, r.title, r.description, r.source,
         r.external_id, r.priority, r.status, r.metadata,
         r.created_at, r.updated_at,
         COUNT(DISTINCT tl.target_id) AS test_case_count
       FROM requirements r
       LEFT JOIN trace_links tl
         ON tl.source_id = r.id::text AND tl.source_type = 'REQUIREMENT' AND tl.target_type = 'TEST_CASE'
       WHERE r.project_id = $1
         AND (r.id::text = $2 OR r.external_id = $2)
       GROUP BY r.id, r.project_id, r.title, r.description, r.source,
                r.external_id, r.priority, r.status, r.metadata,
                r.created_at, r.updated_at`,
      [projectId, reqId],
    );
    if (!result.rows.length) {
      log.warn('getRequirement: not found', { reqId, projectId });
      throw new ApiError(404, 'Requirement not found');
    }
    return this.mapRequirement(result.rows[0]);
  }

  // ── CREATE (single) ──────────────────────────────────────────────────
  async createRequirement(
    projectId: string,
    dto: {
      title: string;
      description?: string;
      priority?: string;
      status?: string;
      source?: string;
      externalId?: string;
      metadata?: Record<string, unknown>;
    },
    llmConfig?: { apiEndpoint: string; apiKey: string; modelName: string },
  ) {
    log.info('createRequirement', { projectId, title: dto.title, priority: dto.priority });
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Duplicate title check within project
      const existing = await client.query(
        'SELECT id FROM requirements WHERE title = $1 AND project_id = $2',
        [dto.title.trim(), projectId],
      );
      if (existing.rows.length) {
        log.warn('createRequirement: duplicate title', { projectId, title: dto.title });
        throw new ApiError(409, `A requirement titled "${dto.title}" already exists in this project`);
      }

      // Auto-generate external_id if not supplied by caller
      const externalId = dto.externalId?.trim() || await this.generateExternalId(projectId, client);

      const result = await client.query(
        `INSERT INTO requirements
           (project_id, title, description, priority, status, source, external_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          projectId,
          dto.title.trim(),
          dto.description || null,
          dto.priority || 'MEDIUM',
          dto.status || 'ACTIVE',
          dto.source || 'MANUAL',
          externalId,
          JSON.stringify(dto.metadata || {}),
        ],
      );

      // ── Fix 1: Mirror requirement into knowledge_vectors so it is
      //    searchable by the generation layer via pgvector similarity.
      //    Done inside the same transaction so the KB row is always
      //    consistent with the requirements row.
      const reqId: string = result.rows[0].id;
      const kvContent = this.buildKbContent(
        dto.title.trim(),
        dto.description,
        externalId,
        dto.priority,
      );
      const kvResult = await client.query(
        `INSERT INTO knowledge_vectors
           (project_id, doc_type, doc_id, content, metadata, embedding_status)
         VALUES ($1, 'requirement', $2, $3, $4, 'PENDING')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          projectId,
          reqId,
          kvContent,
          JSON.stringify({ requirementId: reqId, externalId, priority: dto.priority || 'MEDIUM' }),
        ],
      );

      await client.query('COMMIT');
      const req = this.mapRequirement(result.rows[0]);
      log.info('createRequirement: created', { projectId, id: req.id, externalId: req.externalId });

      // Enqueue embedding job outside the transaction (BullMQ is not transactional)
      if (kvResult.rows.length && llmConfig) {
        await this.enqueueEmbedding({
          knowledgeVectorId: kvResult.rows[0].id as string,
          projectId,
          docType: 'requirement',
          docId: reqId,
          content: kvContent,
          llmConfig,
        });
        log.debug('createRequirement: embedding enqueued', { id: req.id });
      } else if (!llmConfig) {
        log.warn('createRequirement: no LLM config — KB entry left as PENDING (no embedding)', { id: req.id });
      }

      return req;
    } catch (err) {
      await client.query('ROLLBACK');
      log.error('createRequirement: rolled back', { projectId, title: dto.title, err });
      throw err;
    } finally {
      client.release();
    }
  }

  // ── BULK IMPORT (CSV / text-parsed results) ──────────────────────────
  async bulkImport(
    projectId: string,
    requirements: Array<{
      title: string;
      description?: string;
      priority?: string;
      source?: string;
      externalId?: string;
      metadata?: Record<string, unknown>;
    }>,
    llmConfig?: { apiEndpoint: string; apiKey: string; modelName: string },
  ) {
    log.info('bulkImport: started', { projectId, count: requirements.length });
    if (!requirements.length) return { inserted: 0, skipped: 0, requirements: [] };

    const pool = getPool();
    const client = await pool.connect();
    const inserted: unknown[] = [];
    // Collect KB row IDs + content so we can enqueue embeddings after COMMIT
    const toEmbed: Array<{ kvId: string; reqId: string; content: string }> = [];
    let skipped = 0;

    try {
      await client.query('BEGIN');

      for (const req of requirements) {
        if (!req.title?.trim()) { skipped++; continue; }

        const existing = await client.query(
          'SELECT id FROM requirements WHERE title = $1 AND project_id = $2',
          [req.title.trim(), projectId],
        );
        if (existing.rows.length) { skipped++; continue; }

        // Auto-generate external_id per row if not supplied
        const externalId = req.externalId?.trim() || await this.generateExternalId(projectId, client);

        const result = await client.query(
          `INSERT INTO requirements
             (project_id, title, description, priority, status, source, external_id, metadata)
           VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7)
           RETURNING *`,
          [
            projectId,
            req.title.trim(),
            req.description || null,
            req.priority || 'MEDIUM',
            req.source || 'MANUAL',
            externalId,
            JSON.stringify(req.metadata || {}),
          ],
        );
        const reqId: string = result.rows[0].id;
        inserted.push(this.mapRequirement(result.rows[0]));

        // ── Fix 1 (bulk path): Mirror into knowledge_vectors inside the
        //    same transaction so every imported requirement is vectorizable.
        const kvContent = this.buildKbContent(
          req.title.trim(),
          req.description,
          externalId,
          req.priority,
        );
        const kvResult = await client.query(
          `INSERT INTO knowledge_vectors
             (project_id, doc_type, doc_id, content, metadata, embedding_status)
           VALUES ($1, 'requirement', $2, $3, $4, 'PENDING')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            projectId,
            reqId,
            kvContent,
            JSON.stringify({ requirementId: reqId, externalId, priority: req.priority || 'MEDIUM' }),
          ],
        );
        if (kvResult.rows.length) {
          toEmbed.push({ kvId: kvResult.rows[0].id as string, reqId, content: kvContent });
        }
      }

      await client.query('COMMIT');
      log.info('bulkImport: completed', { projectId, inserted: inserted.length, skipped });

      // Enqueue embedding jobs after COMMIT (BullMQ is not transactional)
      if (llmConfig && toEmbed.length) {
        for (const item of toEmbed) {
          await this.enqueueEmbedding({
            knowledgeVectorId: item.kvId,
            projectId,
            docType: 'requirement',
            docId: item.reqId,
            content: item.content,
            llmConfig,
          });
        }
        log.debug('bulkImport: embedding jobs enqueued', { projectId, count: toEmbed.length });
      } else if (!llmConfig && toEmbed.length) {
        log.warn('bulkImport: no LLM config — KB entries left as PENDING (no embeddings)', { projectId, count: toEmbed.length });
      }

      return { inserted: inserted.length, skipped, requirements: inserted };
    } catch (err) {
      await client.query('ROLLBACK');
      log.error('bulkImport: rolled back', { projectId, err });
      throw err;
    } finally {
      client.release();
    }
  }

  // ── UPDATE ───────────────────────────────────────────────────────────
  // reqId may be UUID or external_id
  async updateRequirement(
    reqId: string,
    projectId: string,
    dto: Partial<{
      title: string;
      description: string;
      priority: string;
      status: string;
      metadata: Record<string, unknown>;
    }>,
  ) {
    log.info('updateRequirement', { reqId, projectId, fields: Object.keys(dto) });
    const pool = getPool();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (dto.title !== undefined) { values.push(dto.title.trim()); updates.push(`title = $${values.length}`); }
    if (dto.description !== undefined) { values.push(dto.description); updates.push(`description = $${values.length}`); }
    if (dto.priority !== undefined) { values.push(dto.priority); updates.push(`priority = $${values.length}`); }
    if (dto.status !== undefined) { values.push(dto.status); updates.push(`status = $${values.length}`); }
    if (dto.metadata !== undefined) { values.push(JSON.stringify(dto.metadata)); updates.push(`metadata = $${values.length}`); }

    if (!updates.length) throw new ApiError(400, 'No fields to update');

    values.push(new Date());
    updates.push(`updated_at = $${values.length}`);

    values.push(reqId);
    values.push(projectId);

    const result = await pool.query(
      `UPDATE requirements SET ${updates.join(', ')}
       WHERE (id::text = $${values.length - 1} OR external_id = $${values.length - 1})
         AND project_id = $${values.length}
       RETURNING *`,
      values,
    );
    if (!result.rows.length) {
      log.warn('updateRequirement: not found', { reqId, projectId });
      throw new ApiError(404, 'Requirement not found');
    }
    return this.mapRequirement(result.rows[0]);
  }

  // ── DELETE ───────────────────────────────────────────────────────────
  // reqId may be UUID or external_id
  async deleteRequirement(reqId: string, projectId: string) {
    log.info('deleteRequirement', { reqId, projectId });
    const pool = getPool();
    const result = await pool.query(
      `DELETE FROM requirements
       WHERE (id::text = $1 OR external_id = $1) AND project_id = $2
       RETURNING id`,
      [reqId, projectId],
    );
    if (!result.rows.length) {
      log.warn('deleteRequirement: not found', { reqId, projectId });
      throw new ApiError(404, 'Requirement not found');
    }
    log.info('deleteRequirement: deleted', { id: result.rows[0].id, projectId });
    return { success: true, id: result.rows[0].id };
  }

  // ── STATS ────────────────────────────────────────────────────────────
  async getStats(projectId: string) {
    log.info('getStats', { projectId });
    const pool = getPool();

    const [total, byCoverage, byPriority] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM requirements WHERE project_id = $1', [projectId]),

      pool.query(
        `WITH req_counts AS (
           SELECT
             r.id,
             COUNT(DISTINCT tl.target_id) AS tc_count
           FROM requirements r
           LEFT JOIN trace_links tl
             ON tl.source_id = r.id::text
            AND tl.source_type = 'REQUIREMENT'
            AND tl.target_type = 'TEST_CASE'
           WHERE r.project_id = $1
           GROUP BY r.id
         )
         SELECT
           CASE
             WHEN tc_count = 0 THEN 'NOT_COVERED'
             WHEN tc_count < 2 THEN 'PARTIAL'
             ELSE 'COVERED'
           END AS coverage_status,
           COUNT(*) AS count
         FROM req_counts
         GROUP BY tc_count`,
        [projectId],
      ),

      pool.query(
        `SELECT priority, COUNT(*) AS count
         FROM requirements WHERE project_id = $1 GROUP BY priority`,
        [projectId],
      ),
    ]);

    return {
      total: parseInt(total.rows[0].count, 10),
      byCoverage: Object.fromEntries(byCoverage.rows.map((r: any) => [r.coverage_status, parseInt(r.count, 10)])),
      byPriority: Object.fromEntries(byPriority.rows.map((r: any) => [r.priority, parseInt(r.count, 10)])),
    };
  }

  // ── KB CONTENT BUILDER ───────────────────────────────────────────────
  // Produces a rich, searchable text block stored in knowledge_vectors.content.
  // Format keeps it human-readable and LLM-friendly.
  private buildKbContent(
    title: string,
    description?: string | null,
    externalId?: string | null,
    priority?: string | null,
  ): string {
    const lines = [
      `Requirement: ${title}`,
      externalId   ? `ID: ${externalId}`             : null,
      priority     ? `Priority: ${priority}`          : null,
      description  ? `Description: ${description}`   : null,
    ].filter(Boolean);
    return lines.join('\n');
  }

  // ── EMBED ENQUEUE HELPER ──────────────────────────────────────────────
  private async enqueueEmbedding(opts: {
    knowledgeVectorId: string;
    projectId: string;
    docType: string;
    docId: string;
    content: string;
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string };
  }) {
    const queue = getEmbeddingQueue();
    await queue.add(
      `embed-req-${opts.knowledgeVectorId}`,
      {
        projectId:          opts.projectId,
        docType:            opts.docType,
        docId:              opts.docId,
        content:            opts.content,
        chunkIndex:         0,
        knowledgeVectorId:  opts.knowledgeVectorId,
        llmConfig: {
          apiEndpoint: opts.llmConfig.apiEndpoint,
          apiKey:      opts.llmConfig.apiKey,
          modelName:   opts.llmConfig.modelName,
        },
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  }

  // ── MAPPER ───────────────────────────────────────────────────────────
  private mapRequirement(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      source: row.source,
      externalId: row.external_id,
      metadata: row.metadata,
      testCaseCount: row.test_case_count !== undefined ? parseInt(row.test_case_count, 10) : undefined,
      coverageStatus: row.coverage_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
