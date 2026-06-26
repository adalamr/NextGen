import { Job } from 'bullmq';
import { logger } from '../../utils/logger';
import { getPool } from '../../config/database.config';
import { LLMGateway, buildScriptGenerationPrompt } from '@platform/llm-gateway';

export interface ScriptGenerationJobData {
  projectId: string;
  testCaseId: string;
  framework: string;
  language?: string;
  llmConfig: {
    apiEndpoint: string;
    apiKey: string;
    modelName: string;
    region?: string;
  };
}

/**
 * Layer 3 — Script Generation Processor
 *
 * Runs asynchronously via BullMQ.  Loads test case + POM + API contracts,
 * calls the LLM, and persists the generated script.
 */
export async function scriptGenerationProcessor(job: Job<ScriptGenerationJobData>) {
  const { projectId, testCaseId, framework, language, llmConfig } = job.data;
  const pool = getPool();

  logger.info(`Script generation: testCase=${testCaseId}, framework=${framework}`);
  await job.updateProgress(10);

  // ── Load test case ────────────────────────────────────────────────────
  const tcResult = await pool.query(
    'SELECT * FROM test_cases WHERE id = $1 AND project_id = $2',
    [testCaseId, projectId],
  );
  if (!tcResult.rows.length) {
    logger.warn(`Script generation: test case ${testCaseId} not found`);
    return { status: 'skipped', reason: 'test_case_not_found' };
  }
  const tc = tcResult.rows[0];

  await job.updateProgress(25);

  // ── Load POM + API contracts ──────────────────────────────────────────
  const [pomResult, apiResult] = await Promise.all([
    pool.query('SELECT name, url_pattern, elements, actions FROM app_model_pages WHERE project_id = $1', [projectId]),
    pool.query('SELECT endpoint, method, params, schemas FROM app_model_api_contracts WHERE project_id = $1', [projectId]),
  ]);

  await job.updateProgress(40);

  // ── Generate script via LLM ───────────────────────────────────────────
  const gateway = new LLMGateway(llmConfig);
  const { systemPrompt, userPrompt } = buildScriptGenerationPrompt({
    testCase: { title: tc.title, steps: tc.steps, preconditions: tc.preconditions, expectedResults: tc.expected_results },
    framework,
    pageObjects:  pomResult.rows,
    apiContracts: apiResult.rows,
  });

  const response = await gateway.complete({ systemPrompt, userPrompt, config: llmConfig, responseFormat: 'text' });
  const content = response.content;

  await job.updateProgress(70);

  // ── Persist script ────────────────────────────────────────────────────
  const existingScript = await pool.query(
    'SELECT id, version FROM scripts WHERE test_case_id = $1 AND framework = $2 AND project_id = $3',
    [testCaseId, framework, projectId],
  );

  if (existingScript.rows.length) {
    const existing = existingScript.rows[0];
    await pool.query(
      `UPDATE scripts SET content = $1, status = 'GENERATED', version = $2, updated_at = NOW() WHERE id = $3`,
      [content, (existing.version || 1) + 1, existing.id],
    );
  } else {
    await pool.query(
      `INSERT INTO scripts (project_id, test_case_id, framework, language, content, status, version)
       VALUES ($1, $2, $3, $4, $5, 'GENERATED', 1)`,
      [projectId, testCaseId, framework, language || 'typescript', content],
    );
  }

  await job.updateProgress(100);
  logger.info(`Script generation complete: testCase=${testCaseId}, framework=${framework}`);
  return { projectId, testCaseId, framework, status: 'completed' };
}
