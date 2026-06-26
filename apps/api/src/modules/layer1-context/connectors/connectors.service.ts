import { Queue } from 'bullmq';
import { getPool } from '../../../config/database.config';
import { childLogger } from '../../../utils/logger';
import { TemplatesService } from '../templates/templates.service';

const log = childLogger('layer1:connectors');

// ── Connector type → LLM docContentType ─────────────────────────────────────
const DOC_CONTENT_TYPE_MAP: Record<string, string> = {
  SPEC:         'REQUIREMENTS',
  API_SPEC:     'SWAGGER',
  DB_SCHEMA:    'DB_SCHEMA',
  UI_DOM:       'UI_SPEC',
  CODE_REPO:    'GENERAL',
  DEFECTS:      'GENERAL',
  LOGS:         'GENERAL',
  TEST_RESULTS: 'GENERAL',
};

// ── Trigger type mapping ─────────────────────────────────────────────────────
const JOB_TRIGGER_MAP: Record<string, 'MANUAL' | 'SCHEDULE' | 'WEBHOOK'> = {
  MANUAL:       'MANUAL',
  NIGHTLY:      'SCHEDULE',
  PR_MERGED:    'WEBHOOK',
  SPEC_UPDATED: 'WEBHOOK',
};

// ── Lazy BullMQ queue (one instance reused) ──────────────────────────────────
let _ingestionQueue: Queue | null = null;
function getIngestionQueue(): Queue {
  if (!_ingestionQueue) {
    _ingestionQueue = new Queue('layer1:ingestion', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null,
      },
    });
  }
  return _ingestionQueue;
}

/**
 * Layer 1 - Connectors Service
 * Handles ingestion triggers from: Specs, Code Repo, API Specs,
 * DB Schema, UI/DOM Crawl, Defects/Incidents, Logs, Test Results
 */
export class ConnectorsService {
  async getConnectors(projectId: string) {
    log.info('getConnectors', { projectId });
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM connectors WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId],
    );
    return result.rows;
  }

  async createConnector(projectId: string, dto: {
    name: string;
    type: 'SPEC' | 'CODE_REPO' | 'API_SPEC' | 'DB_SCHEMA' | 'UI_DOM' | 'DEFECTS' | 'LOGS' | 'TEST_RESULTS';
    config: Record<string, unknown>;
  }) {
    log.info('createConnector', { projectId, name: dto.name, type: dto.type });
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO connectors (project_id, name, type, config)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [projectId, dto.name, dto.type, JSON.stringify(dto.config)],
    );
    return result.rows[0];
  }

  async triggerIngestion(connectorId: string, trigger: 'PR_MERGED' | 'SPEC_UPDATED' | 'NIGHTLY' | 'MANUAL') {
    log.info('triggerIngestion', { connectorId, trigger });
    const pool = getPool();

    // 1. Fetch connector + project (for orgId and LLM config)
    const connResult = await pool.query(
      `SELECT c.id, c.project_id, c.type, c.config,
              p.org_id, p.llm_endpoint, p.llm_api_key_encrypted, p.llm_model
       FROM connectors c
       JOIN projects p ON p.id = c.project_id
       WHERE c.id = $1`,
      [connectorId],
    );
    if (!connResult.rows.length) {
      throw { status: 404, message: 'Connector not found' };
    }
    const connector = connResult.rows[0];

    // 2. Insert the ingestion run as QUEUED
    const runResult = await pool.query(
      `INSERT INTO ingestion_runs (connector_id, trigger, status)
       VALUES ($1, $2, 'QUEUED') RETURNING *`,
      [connectorId, trigger],
    );
    const run = runResult.rows[0];

    // 3. Build job data
    const connConfig: Record<string, unknown> = connector.config || {};
    const jobTrigger = JOB_TRIGGER_MAP[trigger] ?? 'MANUAL';
    const docContentType = DOC_CONTENT_TYPE_MAP[connector.type] ?? 'GENERAL';

    if (!connector.llm_endpoint || !connector.llm_api_key_encrypted) {
      log.warn('triggerIngestion: project has no LLM config — LLM extraction steps will be skipped by the worker', {
        connectorId, runId: run.id,
      });
    }

    // Auto-fetch the active input + output templates so the worker always uses
    // the latest seeded schemas — no need to bake them into connector config.
    const tmplService = new TemplatesService();
    const [activeInput, activeOutput] = await Promise.all([
      tmplService.getActiveInputTemplate(connector.org_id as string),
      tmplService.getActiveOutputTemplate(connector.org_id as string),
    ]);

    // Connector config can still override the org-level template (per-connector customisation)
    const inputTemplateSchema: string =
      (connConfig['inputTemplateSchema'] as string | undefined) ??
      (activeInput  ? JSON.stringify(activeInput.schema)  : '{}');

    const outputTemplateSchema: string =
      (connConfig['outputTemplateSchema'] as string | undefined) ??
      (activeOutput ? JSON.stringify(activeOutput.schema) : '{}');

    log.info('triggerIngestion: resolved templates', {
      connectorId,
      inputTemplateSource:  connConfig['inputTemplateSchema']  ? 'connector-config' : (activeInput  ? 'org-active' : 'empty-fallback'),
      outputTemplateSource: connConfig['outputTemplateSchema'] ? 'connector-config' : (activeOutput ? 'org-active' : 'empty-fallback'),
    });

    const jobData = {
      connectorId,
      projectId:  connector.project_id as string,
      orgId:      connector.org_id as string,
      trigger:    jobTrigger,
      sourceType: connConfig['parsedDocumentId'] ? 'FILE_UPLOAD' : 'TEXT_INPUT',
      config: {
        rawContent:              connConfig['rawContent']              as string | undefined,
        parsedDocumentId:        connConfig['parsedDocumentId']        as string | undefined,
        inputTemplateSchema,
        outputTemplateSchema,
        llmApiEndpoint:          (connector.llm_endpoint            as string) || '',
        llmApiKey:               (connector.llm_api_key_encrypted   as string) || '',
        llmModelName:            (connector.llm_model               as string) || '',
        autoExtractRequirements: (connConfig['autoExtractRequirements'] as boolean) ?? true,
        autoExtractAppModel:     (connConfig['autoExtractAppModel']     as boolean) ?? true,
        docContentType,
      },
    };

    // 4. Dispatch to BullMQ
    await getIngestionQueue().add('ingest', jobData, {
      jobId:    run.id as string,
      attempts: 3,
      backoff:  { type: 'exponential', delay: 5000 },
    });

    log.info('triggerIngestion: job dispatched to layer1:ingestion queue', {
      connectorId, runId: run.id, trigger: jobTrigger,
    });
    return run;
  }

  async getIngestionRuns(projectId: string) {
    log.info('getIngestionRuns', { projectId });
    const pool = getPool();
    const result = await pool.query(
      `SELECT ir.* FROM ingestion_runs ir
       JOIN connectors c ON c.id = ir.connector_id
       WHERE c.project_id = $1 ORDER BY ir.created_at DESC LIMIT 50`,
      [projectId],
    );
    return result.rows;
  }
}
