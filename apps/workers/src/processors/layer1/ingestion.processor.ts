import { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { logger } from '../../utils/logger';
import { getPool } from '../../config/database.config';
import { QUEUE_NAMES } from '../../queues/queue-names';
import {
  LLMGateway,
  buildRequirementExtractionPrompt,
  ExtractedRequirement,
  buildApiContractExtractionPrompt,
  buildUiPageExtractionPrompt,
  buildDbSchemaExtractionPrompt,
} from '@platform/llm-gateway';

// ── Queue Handles ──────────────────────────────────────────────────────
const embeddingQueue = new Queue(QUEUE_NAMES.EMBEDDING, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null,
  },
});

export interface IngestionJobData {
  connectorId: string;
  projectId: string;
  orgId: string;
  trigger: 'MANUAL' | 'SCHEDULE' | 'WEBHOOK';
  sourceType: 'FILE_UPLOAD' | 'TEXT_INPUT' | 'CSV_IMPORT';
  config: {
    rawContent?: string;
    parsedDocumentId?: string;
    inputTemplateSchema?: string;
    outputTemplateSchema?: string;
    llmApiEndpoint: string;
    llmApiKey: string;
    llmModelName: string;
    region?: string;
    autoExtractRequirements?: boolean;
    autoExtractAppModel?: boolean;
    docContentType?: 'REQUIREMENTS' | 'SWAGGER' | 'UI_SPEC' | 'DB_SCHEMA' | 'GENERAL';
  };
}

export async function ingestionProcessor(job: Job<IngestionJobData>) {
  const { connectorId, projectId, sourceType, config } = job.data;
  const pool = getPool();

  logger.info(`Ingestion job started: connector=${connectorId}, project=${projectId}, source=${sourceType}`);
  await job.updateProgress(5);

  // ── Step 1: Load raw content ──────────────────────────────────────────────
let rawContent = config.rawContent || '';

  if (config.parsedDocumentId) {
    const docResult = await pool.query(
      'SELECT raw_content FROM parsed_documents WHERE id = $1 AND project_id = $2',
      [config.parsedDocumentId, projectId],
    );
    if (docResult.rows.length) {
      rawContent = docResult.rows[0].raw_content || '';
      await pool.query('UPDATE parsed_documents SET status = $1 WHERE id = $2', ['PROCESSING', config.parsedDocumentId]);
    }
  }

  if (!rawContent.trim()) {
    logger.warn(`Ingestion job: no raw content for connector ${connectorId}`);
    return { connectorId, status: 'skipped', reason: 'no_content' };
  }

  await job.updateProgress(15);

  const llmConfig = {
    apiEndpoint: config.llmApiEndpoint,
    apiKey: config.llmApiKey,
    modelName: config.llmModelName,
    region: config.region || 'us-east-1',
  };
  const gateway = new LLMGateway(llmConfig);

  const results: { requirements?: number; apiContracts?: number; pages?: number; schemaTables?: number; embeddingJobs?: number } = {};

  // ── Step 2: Extract Requirements ───────────────────────────────────────
  if (config.autoExtractRequirements !== false &&
      (!config.docContentType || config.docContentType === 'REQUIREMENTS' || config.docContentType === 'GENERAL')) {
    try {
      const { systemPrompt, userPrompt } = buildRequirementExtractionPrompt({
        rawText: rawContent,
        sourceType,
        inputTemplateSchema: config.inputTemplateSchema || '{}',
        maxRequirements: 30,
      });
      const extracted = await gateway.completeJSON<ExtractedRequirement[]>({ systemPrompt, userPrompt, config: llmConfig });
      if (Array.isArray(extracted)) {
        let inserted = 0;
        for (const req of extracted) {
          if (!req.title?.trim()) continue;
          const exists = await pool.query('SELECT id FROM requirements WHERE title = $1 AND project_id = $2', [req.title.trim(), projectId]);
          if (exists.rows.length) continue;
          await pool.query(
            `INSERT INTO requirements (project_id, title, description, priority, status, source, external_id, metadata)
             VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7)`,
            [projectId, req.title.trim(), req.description || null, req.priority || 'MEDIUM', req.source || sourceType,
             req.externalId || null, JSON.stringify({ acceptanceCriteria: req.acceptanceCriteria || [], businessRules: req.businessRules || [], tags: req.tags || [] })],
          );
          inserted++;
        }
        results.requirements = inserted;
        logger.info(`Ingestion: extracted ${inserted} requirements`);
      }
    } catch (err) { logger.error('Requirement extraction failed:', err); }
  }

  await job.updateProgress(40);

  // ── Step 3: Extract App Model ──────────────────────────────────────────
  if (config.autoExtractAppModel !== false) {
    if (config.docContentType === 'SWAGGER') {
      try {
        const { systemPrompt, userPrompt } = buildApiContractExtractionPrompt({ rawContent, sourceType: 'SWAGGER' });
        const contracts = await gateway.completeJSON<Array<Record<string, unknown>>>({ systemPrompt, userPrompt, config: llmConfig });
        if (Array.isArray(contracts)) {
          for (const c of contracts) {
            if (!c.endpoint || !c.method) continue;
            await pool.query(
              `INSERT INTO app_model_api_contracts (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
              [projectId, c.endpoint, String(c.method).toUpperCase(), JSON.stringify(c.params || {}),
               JSON.stringify(c.schemas || {}), JSON.stringify(c.auth || {}), JSON.stringify(c.rateLimits || {}), c.version || 'v1'],
            );
          }
          results.apiContracts = contracts.length;
        }
      } catch (err) { logger.error('API contract extraction failed:', err); }
    }

    if (config.docContentType === 'UI_SPEC') {
      try {
        const { systemPrompt, userPrompt } = buildUiPageExtractionPrompt({ rawContent, sourceType: 'TEXT' });
        const pages = await gateway.completeJSON<Array<Record<string, unknown>>>({ systemPrompt, userPrompt, config: llmConfig });
        if (Array.isArray(pages)) {
          for (const p of pages) {
            if (!p.name) continue;
            const ex = await pool.query('SELECT id FROM app_model_pages WHERE project_id = $1 AND name = $2', [projectId, p.name]);
            if (ex.rows.length) {
              await pool.query(
                `UPDATE app_model_pages SET url_pattern = COALESCE($3, url_pattern), elements = $4, actions = $5, updated_at = NOW() WHERE id = $6`,
                [projectId, p.name, p.urlPattern || null, JSON.stringify(p.elements || []), JSON.stringify(p.actions || []), ex.rows[0].id],
              );
            } else {
              await pool.query(
                `INSERT INTO app_model_pages (project_id, name, url_pattern, elements, actions) VALUES ($1, $2, $3, $4, $5)`,
                [projectId, p.name, p.urlPattern || null, JSON.stringify(p.elements || []), JSON.stringify(p.actions || [])],
              );
            }
          }
          results.pages = pages.length;
        }
      } catch (err) { logger.error('UI page extraction failed:', err); }
    }

    if (config.docContentType === 'DB_SCHEMA') {
      try {
        const { systemPrompt, userPrompt } = buildDbSchemaExtractionPrompt({ rawContent, sourceType: 'TEXT' });
        const tables = await gateway.completeJSON<Array<Record<string, unknown>>>({ systemPrompt, userPrompt, config: llmConfig });
        if (Array.isArray(tables)) {
          for (const t of tables) {
            if (!t.tableName) continue;
            const ex = await pool.query('SELECT id FROM app_model_schema_graph WHERE project_id = $1 AND table_name = $2', [projectId, t.tableName]);
            if (ex.rows.length) {
              await pool.query(
                `UPDATE app_model_schema_graph SET columns = $3, relations = $4, constraints = $5, indexes = $6 WHERE id = $7`,
                [projectId, t.tableName, JSON.stringify(t.columns || []), JSON.stringify(t.relations || []),
                 JSON.stringify(t.constraints || []), JSON.stringify(t.indexes || []), ex.rows[0].id],
              );
            } else {
              await pool.query(
                `INSERT INTO app_model_schema_graph (project_id, table_name, columns, relations, constraints, indexes) VALUES ($1, $2, $3, $4, $5, $6)`,
                [projectId, t.tableName, JSON.stringify(t.columns || []), JSON.stringify(t.relations || []),
                 JSON.stringify(t.constraints || []), JSON.stringify(t.indexes || [])],
              );
            }
          }
          results.schemaTables = tables.length;
        }
      } catch (err) { logger.error('DB schema extraction failed:', err); }
    }
  }

  await job.updateProgress(70);

  // ── Step 4: Chunk text & enqueue embeddings ──────────────────────────────
  const chunks = chunkText(rawContent, 1000, 100);
  for (let i = 0; i < chunks.length; i++) {
    await embeddingQueue.add(`embed-${connectorId}-${i}`, {
      projectId,
      docType: config.docContentType || 'DOCUMENT',
      docId: connectorId,
      content: chunks[i],
      chunkIndex: i,
      llmConfig: { apiEndpoint: config.llmApiEndpoint, apiKey: config.llmApiKey, modelName: config.llmModelName, region: config.region || 'us-east-1' },
    });
  }
  results.embeddingJobs = chunks.length;

  // ── Step 5: Finalize ────────────────────────────────────────────────────────────
  if (config.parsedDocumentId) {
    await pool.query(
      `UPDATE parsed_documents SET status = 'DONE', parsed_content = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(results), config.parsedDocumentId],
    );
  }

  await pool.query('UPDATE connectors SET last_synced_at = NOW(), status = $1 WHERE id = $2', ['ACTIVE', connectorId]);

  await pool.query(
    `INSERT INTO ingestion_runs (connector_id, status, records_processed, records_failed, metadata)
     VALUES ($1, 'SUCCESS', $2, 0, $3)`,
    [connectorId, Object.values(results).reduce((a: number, b) => a + (b || 0), 0), JSON.stringify(results)],
  );

  await job.updateProgress(100);
  logger.info(`Ingestion job complete: ${JSON.stringify(results)}`);
  return { connectorId, status: 'completed', results };
}

// ── Text chunking helper ─────────────────────────────────────────────────────────
function chunkText(text: string, chunkSize = 1000, overlap = 100): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > chunkSize) {
      if (current.trim()) {
        chunks.push(current.trim());
        const words = current.split(' ');
        current = words.slice(-Math.floor(overlap / 6)).join(' ') + ' ' + sentence;
      } else {
        chunks.push(sentence.trim());
        current = '';
      }
    } else {
      current += ' ' + sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 20);
}
