import { Queue } from 'bullmq';
import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import {
  LLMGateway,
  buildScriptGenerationPrompt,
} from '@platform/llm-gateway';

let _scriptGenQueue: Queue | null = null;
function getScriptGenQueue(): Queue {
  if (!_scriptGenQueue) {
    _scriptGenQueue = new Queue('layer3:script-generation', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null,
      },
    });
  }
  return _scriptGenQueue;
}

export const SUPPORTED_FRAMEWORKS = ['PLAYWRIGHT', 'CYPRESS', 'SELENIUM', 'REST_ASSURED', 'K6'] as const;
export type SupportedFramework = (typeof SUPPORTED_FRAMEWORKS)[number];

/**
 * Layer 3 — Script Generator Service
 *
 * Generates automation scripts from test cases using real Page Object Model
 * locators from the App Model (Layer 1E).
 *
 * Supports synchronous (inline LLM) and asynchronous (BullMQ) modes.
 */
export class ScriptGeneratorService {

  // ── LIST SCRIPTS ──────────────────────────────────────────────────────
  async listScripts(
    projectId: string,
    filters: { testCaseId?: string; framework?: string; page?: number; limit?: number } = {},
  ) {
    const pool = getPool();
    const page  = Math.max(1, filters.page  || 1);
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = ['s.project_id = $1'];
    const params: unknown[] = [projectId];

    if (filters.testCaseId) {
      params.push(filters.testCaseId);
      conditions.push(`s.test_case_id = $${params.length}`);
    }
    if (filters.framework) {
      params.push(filters.framework.toUpperCase());
      conditions.push(`s.framework = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const [rows, countRows] = await Promise.all([
      pool.query(
        `SELECT s.id, s.project_id, s.test_case_id, s.framework, s.language,
                s.file_path, s.status, s.version,
                LEFT(s.content, 500) AS excerpt,
                tc.title AS test_case_title,
                s.created_at, s.updated_at
         FROM scripts s
         LEFT JOIN test_cases tc ON tc.id = s.test_case_id
         WHERE ${where}
         ORDER BY s.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      pool.query(`SELECT COUNT(*) FROM scripts s WHERE ${where}`, params),
    ]);

    return {
      scripts: rows.rows.map((row) => this.mapScript(row)),
      total:   parseInt(countRows.rows[0].count, 10),
      page,
      limit,
    };
  }

  // ── GET SINGLE SCRIPT ─────────────────────────────────────────────────
  async getScript(id: string, projectId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT s.*, tc.title AS test_case_title
       FROM scripts s
       LEFT JOIN test_cases tc ON tc.id = s.test_case_id
       WHERE s.id = $1 AND s.project_id = $2`,
      [id, projectId],
    );
    if (!result.rows.length) throw new ApiError(404, 'Script not found');
    return this.mapScript(result.rows[0], true);
  }

  // ── GENERATE SCRIPT (inline — synchronous) ────────────────────────────
  async generateScript(
    projectId: string,
    dto: {
      testCaseId: string;
      framework: SupportedFramework;
      language?: string;
    },
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string; region?: string },
  ) {
    const pool = getPool();

    // Load test case
    const tcResult = await pool.query(
      'SELECT * FROM test_cases WHERE id = $1 AND project_id = $2',
      [dto.testCaseId, projectId],
    );
    if (!tcResult.rows.length) throw new ApiError(404, 'Test case not found');
    const testCase = tcResult.rows[0];

    // Load page objects from App Model (for UI frameworks)
    const pageObjects = await pool.query(
      'SELECT name, url_pattern, elements, actions FROM app_model_pages WHERE project_id = $1',
      [projectId],
    );

    // Load API contracts (for API frameworks)
    const apiContracts = await pool.query(
      'SELECT endpoint, method, params, schemas FROM app_model_api_contracts WHERE project_id = $1',
      [projectId],
    );

    const gateway = new LLMGateway(llmConfig);
    const { systemPrompt, userPrompt } = buildScriptGenerationPrompt({
      testCase: {
        title: testCase.title,
        steps: testCase.steps,
        preconditions: testCase.preconditions,
        expectedResults: testCase.expected_results,
      },
      framework: dto.framework,
      pageObjects: pageObjects.rows,
      apiContracts: apiContracts.rows,
    });

    const response = await gateway.complete({ systemPrompt, userPrompt, config: llmConfig, responseFormat: 'text' });
    const content = response.content;

    // Save or update script
    const existingScript = await pool.query(
      'SELECT id, version FROM scripts WHERE test_case_id = $1 AND framework = $2 AND project_id = $3',
      [dto.testCaseId, dto.framework, projectId],
    );

    let savedScript;
    if (existingScript.rows.length) {
      const existing = existingScript.rows[0];
      savedScript = await pool.query(
        `UPDATE scripts
         SET content = $1, status = 'GENERATED', version = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [content, (existing.version || 1) + 1, existing.id],
      );
    } else {
      savedScript = await pool.query(
        `INSERT INTO scripts
           (project_id, test_case_id, framework, language, content, status, version)
         VALUES ($1, $2, $3, $4, $5, 'GENERATED', 1)
         RETURNING *`,
        [projectId, dto.testCaseId, dto.framework, dto.language || 'typescript', content],
      );
    }

    return this.mapScript(savedScript.rows[0], true);
  }

  // ── QUEUE SCRIPT GENERATION (async — BullMQ) ─────────────────────────
  async queueScriptGeneration(
    projectId: string,
    dto: { testCaseId: string; framework: SupportedFramework },
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string; region?: string },
  ) {
    const queue = getScriptGenQueue();
    const jobName = `script-${dto.testCaseId}-${dto.framework}`;
    await queue.add(
      jobName,
      { projectId, ...dto, llmConfig },
      { attempts: 2, backoff: { type: 'exponential', delay: 3000 } },
    );
    return { queued: true, jobName };
  }

  // ── MAPPER ────────────────────────────────────────────────────────────
  private mapScript(row: any, includeContent = false) {
    return {
      id:            row.id,
      projectId:     row.project_id,
      testCaseId:    row.test_case_id,
      testCaseTitle: row.test_case_title ?? null,
      framework:     row.framework,
      language:      row.language,
      filePath:      row.file_path,
      status:        row.status,
      version:       row.version,
      ...(includeContent ? { content: row.content } : { excerpt: row.excerpt ?? null }),
      createdAt:     row.created_at,
      updatedAt:     row.updated_at,
    };
  }
}
