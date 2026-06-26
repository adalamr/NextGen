import { Job } from 'bullmq';
import { LLMGateway, buildTestCaseGenerationPrompt } from '@platform/llm-gateway';
import { logger } from '../../utils/logger';
import { getPool } from '../../config/database.config';

interface TestCaseGenerationJob {
  jobId: string;
  projectId: string;
  requirementId?: string;   // optional: link generated test cases back to a requirement
  requirementText: string;
  technique: string;
  count: number;
  llmConfig: {
    apiEndpoint: string;
    apiKey: string;
    modelName: string;
  };
}

export async function testCaseGenerationProcessor(job: Job<TestCaseGenerationJob>) {
  const { jobId, projectId, requirementId, requirementText, technique, count, llmConfig } = job.data;

  logger.info(`Processing test case generation job: ${jobId} for project: ${projectId}`);

  await job.updateProgress(10);

  // Initialize LLM Gateway with user-provided config
  const llm = new LLMGateway(llmConfig);
  const pool = getPool();

  // ── Fix 2: Retrieve grounded context before building the prompt ───────

  // 2a. App Model summary — API contracts + UI pages + DB schema + user roles
  const appModelSummary = await buildAppModelSummary(projectId);

  // 2b. Technique definition from the library (name + when_to_use + description)
  const techniqueDefinition = await lookupTechniqueDefinition(technique);

  // 2c. Semantically relevant KB chunks (top-5 cosine neighbours)
  //     Uses raw SQL so the worker has no dep on the API service layer.
  const relevantChunks = await searchKnowledgeBase(projectId, requirementText, llm, llmConfig);

  // 2d. Gold-standard few-shot examples from knowledge_feedback
  const fewShotExamples = await buildFewShotBlock(projectId);

  await job.updateProgress(20);

  // ── Fix 3: Pass retrieved context into the prompt builder ───────────
  const groundedRequirementText = relevantChunks
    ? `${requirementText}\n\n## Relevant Knowledge Base Context\n${relevantChunks}`
    : requirementText;

  const { systemPrompt, userPrompt } = buildTestCaseGenerationPrompt({
    requirementText:    groundedRequirementText,
    technique,
    count,
    appModelSummary:      appModelSummary    || undefined,
    techniqueDefinition:  techniqueDefinition || undefined,
    fewShotExamples:      fewShotExamples    || undefined,
  });

  await job.updateProgress(30);

  // Call LLM and get structured JSON response
  const testCases = await llm.completeJSON<any[]>({ systemPrompt, userPrompt, config: llmConfig });

  await job.updateProgress(70);

  // ── Save test cases to DB + create review gate + traceability links ──
  const savedIds: string[] = [];
  for (const tc of (Array.isArray(testCases) ? testCases : [])) {
    if (!tc.title?.trim()) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert test case
      const tcResult = await client.query(
        `INSERT INTO test_cases
           (project_id, generation_job_id, title, description, preconditions,
            steps, expected_results, postconditions, status, priority, technique, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', $9, $10, $11)
         RETURNING id`,
        [
          projectId,
          jobId,
          tc.title.trim(),
          tc.description || null,
          JSON.stringify(tc.preconditions || []),
          JSON.stringify(tc.steps || []),
          JSON.stringify(tc.expectedResults || tc.expected_results || []),
          JSON.stringify(tc.postconditions || []),
          tc.priority || 'MEDIUM',
          technique,
          JSON.stringify(tc.tags || []),
        ],
      );
      const testCaseId: string = tcResult.rows[0].id;
      savedIds.push(testCaseId);

      // 2. Traceability link: requirement → test case
      if (requirementId) {
        await client.query(
          `INSERT INTO trace_links
             (project_id, source_type, source_id, target_type, target_id, relationship)
           VALUES ($1, 'REQUIREMENT', $2, 'TEST_CASE', $3, 'COVERS')
           ON CONFLICT DO NOTHING`,
          [projectId, requirementId, testCaseId],
        );
      }

      // 3. Review gate (pending human approval)
      await client.query(
        `INSERT INTO review_gates
           (project_id, type, reference_id, title, description, priority, status)
         VALUES ($1, 'TEST_CASE_APPROVAL', $2, $3, $4, $5, 'PENDING')`,
        [
          projectId,
          testCaseId,
          `Review: ${tc.title.trim()}`,
          tc.description || null,
          tc.priority || 'MEDIUM',
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Failed to save test case "${tc.title}": ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  // ── Mark generation job as COMPLETED ──────────────────────────────────
  await pool.query(
    `UPDATE generation_jobs
     SET status = 'COMPLETED', result_count = $1, completed_at = NOW()
     WHERE id = $2`,
    [savedIds.length, jobId],
  );

  await job.updateProgress(100);

  logger.info(`Generated ${savedIds.length} test cases for job: ${jobId}`);
  return { jobId, generatedCount: savedIds.length };
}

// ───────────────────────────────────────────────────────────────
// Context-retrieval helpers (Fix 2)
// All operate directly on the DB — no circular dep on the API service layer.
// ───────────────────────────────────────────────────────────────

/**
 * 2a. App Model Summary
 * Assembles a concise markdown block covering API contracts, UI pages,
 * DB schema tables, and user roles for the given project.
 * Returns null when the project has no app model data yet.
 */
async function buildAppModelSummary(projectId: string): Promise<string | null> {
  const pool = getPool();
  try {
    const [contracts, pages, schema, roles] = await Promise.all([
      pool.query(
        `SELECT method, endpoint, version FROM app_model_api_contracts
         WHERE project_id = $1 ORDER BY endpoint LIMIT 40`,
        [projectId],
      ),
      pool.query(
        `SELECT name, url_pattern FROM app_model_pages
         WHERE project_id = $1 ORDER BY name LIMIT 30`,
        [projectId],
      ),
      pool.query(
        `SELECT table_name FROM app_model_schema_graph
         WHERE project_id = $1 ORDER BY table_name LIMIT 40`,
        [projectId],
      ),
      pool.query(
        `SELECT role_name, description FROM app_model_user_roles
         WHERE project_id = $1 ORDER BY role_name LIMIT 20`,
        [projectId],
      ),
    ]);

    const sections: string[] = [];

    if (contracts.rows.length) {
      sections.push(
        '## API Endpoints\n' +
        contracts.rows
          .map((r: any) => `- ${r.method} ${r.endpoint}${r.version ? ` (${r.version})` : ''}`)
          .join('\n'),
      );
    }

    if (pages.rows.length) {
      sections.push(
        '## UI Pages\n' +
        pages.rows
          .map((r: any) => `- ${r.name}${r.url_pattern ? ` (${r.url_pattern})` : ''}`)
          .join('\n'),
      );
    }

    if (schema.rows.length) {
      sections.push(
        '## Database Tables\n' +
        schema.rows.map((r: any) => `- ${r.table_name}`).join('\n'),
      );
    }

    if (roles.rows.length) {
      sections.push(
        '## User Roles\n' +
        roles.rows
          .map((r: any) => `- ${r.role_name}${r.description ? `: ${r.description}` : ''}`)
          .join('\n'),
      );
    }

    return sections.length ? sections.join('\n\n') : null;
  } catch (err) {
    logger.warn(`buildAppModelSummary: failed for project ${projectId}`, err);
    return null;
  }
}

/**
 * 2b. Technique definition lookup
 * Returns a short description of the technique from technique_library,
 * or null if not found (caller falls back to the prompt's default text).
 */
async function lookupTechniqueDefinition(techniqueName: string): Promise<string | null> {
  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT name, category, description, when_to_use
       FROM technique_library
       WHERE LOWER(name) = LOWER($1) AND is_active = TRUE
       LIMIT 1`,
      [techniqueName],
    );
    if (!result.rows.length) return null;
    const r = result.rows[0];
    return [
      `**${r.name}** (${r.category})`,
      r.description  ? r.description  : null,
      r.when_to_use  ? `When to use: ${r.when_to_use}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  } catch (err) {
    logger.warn(`lookupTechniqueDefinition: failed for "${techniqueName}"`, err);
    return null;
  }
}

/**
 * 2c. Semantic KB search
 * Embeds the requirement text, then runs a pgvector cosine similarity
 * query against knowledge_vectors to surface the top-5 most relevant
 * stored chunks.  Returns a formatted string block, or null if no
 * vectors exist / embedding fails.
 */
async function searchKnowledgeBase(
  projectId: string,
  queryText: string,
  llm: LLMGateway,
  llmConfig: TestCaseGenerationJob['llmConfig'],
): Promise<string | null> {
  const pool = getPool();
  try {
    // Check if there are any embedded vectors first (avoid pointless embed call)
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM knowledge_vectors
       WHERE project_id = $1 AND embedding_status = 'embedded'`,
      [projectId],
    );
    if (parseInt(countResult.rows[0].count, 10) === 0) return null;

    // Embed the query text
    const queryEmbedding = await llm.embed(queryText.slice(0, 8000), llmConfig);
    if (!queryEmbedding || !queryEmbedding.length) return null;

    // pgvector cosine similarity search — top 5 neighbours
    const results = await pool.query(
      `SELECT content, doc_type, metadata,
              1 - (embedding <=> $1::vector) AS similarity
       FROM knowledge_vectors
       WHERE project_id = $2
         AND embedding_status = 'embedded'
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT 5`,
      [JSON.stringify(queryEmbedding), projectId],
    );

    if (!results.rows.length) return null;

    return results.rows
      .map((r: any, i: number) =>
        `[${i + 1}] (${r.doc_type}, similarity: ${parseFloat(r.similarity).toFixed(3)})\n${r.content}`,
      )
      .join('\n\n');
  } catch (err) {
    logger.warn(`searchKnowledgeBase: failed for project ${projectId}`, err);
    return null;
  }
}

/**
 * 2d. Few-shot gold-standard examples
 * Fetches the top-3 approved (is_gold_standard = true) test cases for
 * the project and formats them as concise I/O examples for the prompt.
 * Returns null when none exist yet.
 */
async function buildFewShotBlock(projectId: string): Promise<string | null> {
  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT tc.title, tc.description, tc.steps, tc.expected_results, tc.technique
       FROM test_cases tc
       WHERE tc.project_id = $1
         AND tc.is_gold_standard = TRUE
       ORDER BY tc.reviewed_at DESC NULLS LAST
       LIMIT 3`,
      [projectId],
    );

    if (!result.rows.length) return null;

    return result.rows
      .map((r: any, i: number) => {
        const steps = Array.isArray(r.steps)
          ? r.steps.map((s: any) => `  ${s.order}. ${s.action} → ${s.expectedOutcome}`).join('\n')
          : '';
        return [
          `### Example ${i + 1}: ${r.title}`,
          r.description ? `Description: ${r.description}` : null,
          `Technique: ${r.technique || 'N/A'}`,
          steps ? `Steps:\n${steps}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');
  } catch (err) {
    logger.warn(`buildFewShotBlock: failed for project ${projectId}`, err);
    return null;
  }
}
