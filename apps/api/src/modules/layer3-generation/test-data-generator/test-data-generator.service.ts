import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import { LLMGateway } from '@platform/llm-gateway';

export const DATA_TYPES = ['VALID', 'INVALID', 'BOUNDARY', 'SYNTHETIC'] as const;
export type DataType = (typeof DATA_TYPES)[number];

/**
 * Layer 3 — Test Data Generator Service
 *
 * Generates structured test datasets (VALID / INVALID / BOUNDARY / SYNTHETIC)
 * for a given test case using the LLM.  Datasets are persisted to test_data_sets.
 */
export class TestDataGeneratorService {

  // ── LIST DATA SETS ────────────────────────────────────────────────────
  async listDataSets(
    projectId: string,
    filters: { testCaseId?: string; dataType?: string } = {},
  ) {
    const pool = getPool();
    const conditions = ['tds.project_id = $1'];
    const params: unknown[] = [projectId];

    if (filters.testCaseId) {
      params.push(filters.testCaseId);
      conditions.push(`tds.test_case_id = $${params.length}`);
    }
    if (filters.dataType) {
      params.push(filters.dataType.toUpperCase());
      conditions.push(`tds.data_type = $${params.length}`);
    }

    const result = await pool.query(
      `SELECT tds.*, tc.title AS test_case_title
       FROM test_data_sets tds
       LEFT JOIN test_cases tc ON tc.id = tds.test_case_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY tds.created_at DESC`,
      params,
    );
    return result.rows.map(this.mapDataSet);
  }

  // ── GET SINGLE DATA SET ───────────────────────────────────────────────
  async getDataSet(id: string, projectId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT tds.*, tc.title AS test_case_title
       FROM test_data_sets tds
       LEFT JOIN test_cases tc ON tc.id = tds.test_case_id
       WHERE tds.id = $1 AND tds.project_id = $2`,
      [id, projectId],
    );
    if (!result.rows.length) throw new ApiError(404, 'Test data set not found');
    return this.mapDataSet(result.rows[0]);
  }

  // ── GENERATE TEST DATA (LLM-powered) ──────────────────────────────────
  async generateData(
    projectId: string,
    dto: {
      testCaseId: string;
      dataTypes?: DataType[];
      fieldSchema?: Record<string, unknown>;
      count?: number;
    },
    llmConfig: { apiEndpoint: string; apiKey: string; modelName: string; region?: string },
  ) {
    const pool = getPool();

    // Load test case
    const tcResult = await pool.query(
      'SELECT title, description, steps, preconditions FROM test_cases WHERE id = $1 AND project_id = $2',
      [dto.testCaseId, projectId],
    );
    if (!tcResult.rows.length) throw new ApiError(404, 'Test case not found');
    const tc = tcResult.rows[0];

    const targetTypes: DataType[] = dto.dataTypes ?? ['VALID', 'INVALID', 'BOUNDARY'];
    const count = dto.count ?? 3;

    const gateway = new LLMGateway(llmConfig);

    const systemPrompt = `You are a QA test data engineer. Generate structured test data for the provided test case.
For each requested data type, return ${count} rows of concrete test data values.

${dto.fieldSchema ? `## Field Schema\n${JSON.stringify(dto.fieldSchema, null, 2)}\n` : ''}
Return JSON:
{
  "datasets": [
    {
      "dataType": "VALID" | "INVALID" | "BOUNDARY" | "SYNTHETIC",
      "name": string,
      "rows": [{ "field": "value", ... }]
    }
  ]
}
Return ONLY valid JSON.`;

    const userPrompt = `Test Case: ${tc.title}
Description: ${tc.description || ''}
Steps: ${JSON.stringify(tc.steps)}

Generate test data for types: ${targetTypes.join(', ')}`;

    const result = await gateway.completeJSON<{
      datasets: Array<{
        dataType: DataType;
        name: string;
        rows: Record<string, unknown>[];
      }>;
    }>({ systemPrompt, userPrompt, config: llmConfig });

    // Persist each dataset
    const saved = [];
    for (const ds of result.datasets) {
      const insertResult = await pool.query(
        `INSERT INTO test_data_sets (project_id, test_case_id, name, data_type, data)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          projectId,
          dto.testCaseId,
          ds.name || `${ds.dataType} data`,
          ds.dataType,
          JSON.stringify({ rows: ds.rows }),
        ],
      );
      saved.push(this.mapDataSet(insertResult.rows[0]));
    }

    return { generated: saved.length, datasets: saved };
  }

  // ── DELETE DATA SET ───────────────────────────────────────────────────
  async deleteDataSet(id: string, projectId: string) {
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM test_data_sets WHERE id = $1 AND project_id = $2 RETURNING id',
      [id, projectId],
    );
    if (!result.rows.length) throw new ApiError(404, 'Test data set not found');
    return { success: true, id };
  }

  // ── MAPPER ────────────────────────────────────────────────────────────
  private mapDataSet(row: any) {
    return {
      id:            row.id,
      projectId:     row.project_id,
      testCaseId:    row.test_case_id,
      testCaseTitle: row.test_case_title ?? null,
      name:          row.name,
      dataType:      row.data_type,
      data:          row.data ?? {},
      createdAt:     row.created_at,
    };
  }
}
