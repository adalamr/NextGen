import { Queue } from 'bullmq';
import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';

// ── Lazy BullMQ queue ─────────────────────────────────────────────────────
let _tcGenQueue: Queue | null = null;
function getTcGenQueue(): Queue {
  if (!_tcGenQueue) {
    _tcGenQueue = new Queue('layer3:test-case-generation', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null,
      },
    });
  }
  return _tcGenQueue;
}

/**
 * Layer 3 - Test Case Generator Service
 * Uses LLM Gateway to generate test cases with:
 * - Preconditions, Steps, Expected Results, Postconditions
 * - Traceability Links back to requirements
 */
export class TestCaseGeneratorService {
  async getTestCases(projectId: string, filters: { page?: number; limit?: number; status?: string }) {
    const pool = getPool();
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM test_cases WHERE project_id = $1';
    const params: any[] = [projectId];

    if (filters.status) {
      params.push(filters.status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows.map(this.mapTestCase);
  }

  async getTestCase(id: string) {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM test_cases WHERE id = $1', [id]);
    if (!result.rows.length) throw new ApiError(404, 'Test case not found');
    return this.mapTestCase(result.rows[0]);
  }

  async generateTestCases(dto: {
    projectId: string;
    requirementId?: string;
    requirementText?: string;
    technique?: string;
    count?: number;
  }, userId: string) {
    // Enqueue to BullMQ for async generation
    const pool = getPool();

    // Insert a pending job record
    const jobResult = await pool.query(
      `INSERT INTO generation_jobs (project_id, created_by, input_data, status)
       VALUES ($1, $2, $3, 'QUEUED') RETURNING id`,
      [dto.projectId, userId, JSON.stringify(dto)],
    );

    const jobId: string = jobResult.rows[0].id;

    // Fetch project LLM config for the worker
    const projectResult = await pool.query(
      'SELECT llm_endpoint, llm_api_key_encrypted, llm_model FROM projects WHERE id = $1',
      [dto.projectId],
    );

    if (projectResult.rows.length && projectResult.rows[0].llm_endpoint) {
      const p = projectResult.rows[0];
      const queue = getTcGenQueue();
      await queue.add(
        `generate-${jobId}`,
        {
          jobId,
          projectId:       dto.projectId,
          requirementId:   dto.requirementId,
          requirementText: dto.requirementText || '',
          technique:       dto.technique || 'EQUIVALENCE_PARTITIONING',
          count:           dto.count || 5,
          llmConfig: {
            apiEndpoint: p.llm_endpoint as string,
            apiKey:      p.llm_api_key_encrypted as string,
            modelName:   p.llm_model as string,
          },
        },
        { attempts: 2, backoff: { type: 'exponential', delay: 3000 } },
      );
    }

    return { jobId, status: 'QUEUED', message: 'Test case generation queued' };
  }

  async updateStatus(id: string, status: string, userId: string, reason?: string) {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE test_cases SET
         status = $1,
         reviewed_by = $2,
         review_reason = $3,
         reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, userId, reason || null, id],
    );
    if (!result.rows.length) throw new ApiError(404, 'Test case not found');
    return this.mapTestCase(result.rows[0]);
  }

  private mapTestCase(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      description: row.description,
      preconditions: row.preconditions || [],
      steps: row.steps || [],
      expectedResults: row.expected_results || [],
      postconditions: row.postconditions || [],
      status: row.status,
      priority: row.priority,
      technique: row.technique,
      riskScore: row.risk_score,
      tags: row.tags || [],
      traceabilityLinks: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
