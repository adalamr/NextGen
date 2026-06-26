import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import { childLogger } from '../../../utils/logger';

const log = childLogger('layer1:templates');

/**
 * Layer 1 — Templates Service
 * Manages org-level Input Templates (1A), Output Templates (1B),
 * and Sample I/O Pairs (1D).
 */
export class TemplatesService {

  // ── INPUT TEMPLATES (1A) ──────────────────────────────────────────────

  async getInputTemplates(orgId: string) {
    log.info('getInputTemplates', { orgId });
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM input_templates WHERE org_id = $1 AND is_active = TRUE ORDER BY created_at',
      [orgId],
    );
    return result.rows.map(this.mapInputTemplate);
  }

  async getInputTemplate(id: string, orgId: string) {
    log.info('getInputTemplate', { id, orgId });
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM input_templates WHERE id = $1 AND org_id = $2',
      [id, orgId],
    );
    if (!result.rows.length) {
      log.warn('getInputTemplate: not found', { id, orgId });
      throw new ApiError(404, 'Input template not found');
    }
    return this.mapInputTemplate(result.rows[0]);
  }

  async getActiveInputTemplate(orgId: string): Promise<{ schema: unknown } | null> {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM input_templates WHERE org_id = $1 AND is_active = TRUE ORDER BY created_at LIMIT 1',
      [orgId],
    );
    if (!result.rows.length) return null;
    return this.mapInputTemplate(result.rows[0]);
  }

  async createInputTemplate(
    orgId: string,
    userId: string,
    dto: { name: string; description?: string; schema: Record<string, unknown> },
  ) {
    log.info('createInputTemplate', { orgId, name: dto.name });
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO input_templates (org_id, name, description, schema, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, dto.name, dto.description || null, JSON.stringify(dto.schema), userId],
    );
    return this.mapInputTemplate(result.rows[0]);
  }

  async updateInputTemplate(
    id: string,
    orgId: string,
    dto: Partial<{ name: string; description: string; schema: Record<string, unknown>; isActive: boolean }>,
  ) {
    log.info('updateInputTemplate', { id, orgId, fields: Object.keys(dto) });
    const pool = getPool();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (dto.name !== undefined) { values.push(dto.name); updates.push(`name = $${values.length}`); }
    if (dto.description !== undefined) { values.push(dto.description); updates.push(`description = $${values.length}`); }
    if (dto.schema !== undefined) { values.push(JSON.stringify(dto.schema)); updates.push(`schema = $${values.length}`); }
    if (dto.isActive !== undefined) { values.push(dto.isActive); updates.push(`is_active = $${values.length}`); }
    if (!updates.length) throw new ApiError(400, 'No fields to update');

    values.push(new Date()); updates.push(`updated_at = $${values.length}`);
    values.push(id); values.push(orgId);

    const result = await pool.query(
      `UPDATE input_templates SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND org_id = $${values.length}
       RETURNING *`,
      values,
    );
    if (!result.rows.length) {
      log.warn('updateInputTemplate: not found', { id, orgId });
      throw new ApiError(404, 'Input template not found');
    }
    return this.mapInputTemplate(result.rows[0]);
  }

  // ── OUTPUT TEMPLATES (1B) ─────────────────────────────────────────────

  async getOutputTemplates(orgId: string) {
    log.info('getOutputTemplates', { orgId });
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM output_templates WHERE org_id = $1 AND is_active = TRUE ORDER BY created_at',
      [orgId],
    );
    return result.rows.map(this.mapOutputTemplate);
  }

  async getActiveOutputTemplate(orgId: string): Promise<{ schema: unknown; example: unknown } | null> {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM output_templates WHERE org_id = $1 AND is_active = TRUE ORDER BY created_at LIMIT 1',
      [orgId],
    );
    if (!result.rows.length) return null;
    return this.mapOutputTemplate(result.rows[0]);
  }

  async createOutputTemplate(
    orgId: string,
    userId: string,
    dto: {
      name: string;
      description?: string;
      schema: Record<string, unknown>;
      example?: Record<string, unknown>;
    },
  ) {
    log.info('createOutputTemplate', { orgId, name: dto.name });
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO output_templates (org_id, name, description, schema, example, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [orgId, dto.name, dto.description || null, JSON.stringify(dto.schema), JSON.stringify(dto.example || {}), userId],
    );
    return this.mapOutputTemplate(result.rows[0]);
  }

  async updateOutputTemplate(
    id: string,
    orgId: string,
    dto: Partial<{ name: string; description: string; schema: Record<string, unknown>; example: Record<string, unknown>; isActive: boolean }>,
  ) {
    log.info('updateOutputTemplate', { id, orgId, fields: Object.keys(dto) });
    const pool = getPool();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (dto.name !== undefined) { values.push(dto.name); updates.push(`name = $${values.length}`); }
    if (dto.description !== undefined) { values.push(dto.description); updates.push(`description = $${values.length}`); }
    if (dto.schema !== undefined) { values.push(JSON.stringify(dto.schema)); updates.push(`schema = $${values.length}`); }
    if (dto.example !== undefined) { values.push(JSON.stringify(dto.example)); updates.push(`example = $${values.length}`); }
    if (dto.isActive !== undefined) { values.push(dto.isActive); updates.push(`is_active = $${values.length}`); }
    if (!updates.length) throw new ApiError(400, 'No fields to update');

    values.push(new Date()); updates.push(`updated_at = $${values.length}`);
    values.push(id); values.push(orgId);

    const result = await pool.query(
      `UPDATE output_templates SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND org_id = $${values.length}
       RETURNING *`,
      values,
    );
    if (!result.rows.length) {
      log.warn('updateOutputTemplate: not found', { id, orgId });
      throw new ApiError(404, 'Output template not found');
    }
    return this.mapOutputTemplate(result.rows[0]);
  }

  // ── SAMPLE I/O PAIRS (1D) ─────────────────────────────────────────────

  async getSamplePairs(
    orgId: string,
    filters: { category?: string; search?: string; page?: number; limit?: number } = {},
  ) {
    log.info('getSamplePairs', { orgId, filters });
    const pool = getPool();
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['org_id = $1', 'is_active = TRUE'];
    const params: unknown[] = [orgId];

    if (filters.category) {
      params.push(filters.category);
      conditions.push(`category = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }

    const where = conditions.join(' AND ');

    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT * FROM sample_io_pairs WHERE ${where}
         ORDER BY category, title
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      pool.query(`SELECT COUNT(*) FROM sample_io_pairs WHERE ${where}`, params),
    ]);

    return {
      pairs: rows.rows.map(this.mapSamplePair),
      total: parseInt(count.rows[0].count, 10),
      page,
      limit,
    };
  }

  async getSamplePairsByCategory(orgId: string, category: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM sample_io_pairs WHERE org_id = $1 AND category = $2 AND is_active = TRUE
       ORDER BY title`,
      [orgId, category],
    );
    return result.rows.map(this.mapSamplePair);
  }

  async createSamplePair(
    orgId: string,
    userId: string,
    dto: {
      title: string;
      description?: string;
      category: string;
      inputExample: Record<string, unknown>;
      outputExample: Record<string, unknown>;
      tags?: string[];
    },
  ) {
    log.info('createSamplePair', { orgId, title: dto.title, category: dto.category });
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO sample_io_pairs
         (org_id, title, description, category, input_example, output_example, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        orgId,
        dto.title,
        dto.description || null,
        dto.category.toUpperCase(),
        JSON.stringify(dto.inputExample),
        JSON.stringify(dto.outputExample),
        JSON.stringify(dto.tags || []),
        userId,
      ],
    );
    return this.mapSamplePair(result.rows[0]);
  }

  async updateSamplePair(
    id: string,
    orgId: string,
    dto: Partial<{
      title: string;
      description: string;
      category: string;
      inputExample: Record<string, unknown>;
      outputExample: Record<string, unknown>;
      tags: string[];
      isActive: boolean;
    }>,
  ) {
    const pool = getPool();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (dto.title !== undefined) { values.push(dto.title); updates.push(`title = $${values.length}`); }
    if (dto.description !== undefined) { values.push(dto.description); updates.push(`description = $${values.length}`); }
    if (dto.category !== undefined) { values.push(dto.category.toUpperCase()); updates.push(`category = $${values.length}`); }
    if (dto.inputExample !== undefined) { values.push(JSON.stringify(dto.inputExample)); updates.push(`input_example = $${values.length}`); }
    if (dto.outputExample !== undefined) { values.push(JSON.stringify(dto.outputExample)); updates.push(`output_example = $${values.length}`); }
    if (dto.tags !== undefined) { values.push(JSON.stringify(dto.tags)); updates.push(`tags = $${values.length}`); }
    if (dto.isActive !== undefined) { values.push(dto.isActive); updates.push(`is_active = $${values.length}`); }
    if (!updates.length) throw new ApiError(400, 'No fields to update');

    values.push(new Date()); updates.push(`updated_at = $${values.length}`);
    values.push(id); values.push(orgId);

    const result = await pool.query(
      `UPDATE sample_io_pairs SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND org_id = $${values.length}
       RETURNING *`,
      values,
    );
    if (!result.rows.length) throw new ApiError(404, 'Sample pair not found');
    return this.mapSamplePair(result.rows[0]);
  }

  async deleteSamplePair(id: string, orgId: string) {
    log.info('deleteSamplePair', { id, orgId });
    const pool = getPool();
    // Soft delete
    const result = await pool.query(
      `UPDATE sample_io_pairs SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND org_id = $2 RETURNING id`,
      [id, orgId],
    );
    if (!result.rows.length) {
      log.warn('deleteSamplePair: not found', { id, orgId });
      throw new ApiError(404, 'Sample pair not found');
    }
    log.info('deleteSamplePair: soft-deleted', { id, orgId });
    return { success: true, id };
  }

  // ── GENERATION HELPER ───────────────────────────────────────────────────
  // Returns all the template context needed to build an LLM generation prompt.
  // Called by the test case generation service before sending to the LLM.
  //
  // Returns:
  //   inputInstruction  – "Your input will conform to this schema: {...}"
  //   outputInstruction – "Your output MUST conform to this JSON schema: {...}"
  //   outputExample     – formatted JSON example string (may be empty)
  //   fewShotBlock      – pre-formatted few-shot examples from sample_io_pairs
  async getGenerationContext(
    orgId: string,
    category?: string,
  ): Promise<{
    inputInstruction:  string;
    outputInstruction: string;
    outputExample:     string;
    fewShotBlock:      string;
  }> {
    const [inputTpl, outputTpl, fewShotBlock] = await Promise.all([
      this.getActiveInputTemplate(orgId),
      this.getActiveOutputTemplate(orgId),
      this.buildFewShotBlock(orgId, category, 3),
    ]);

    const inputInstruction = inputTpl
      ? `The requirement you receive will conform to the following input schema. ` +
        `Use the field names to understand the structure:\n\`\`\`json\n${JSON.stringify(inputTpl.schema, null, 2)}\n\`\`\``
      : '';

    const outputInstruction = outputTpl
      ? `Your response MUST be a valid JSON object conforming exactly to this output schema:\n\`\`\`json\n${JSON.stringify((outputTpl as any).schema, null, 2)}\n\`\`\``
      : '';

    const outputExample = outputTpl && (outputTpl as any).example
      ? `Here is a concrete example of a valid output:\n\`\`\`json\n${JSON.stringify((outputTpl as any).example, null, 2)}\n\`\`\``
      : '';

    return { inputInstruction, outputInstruction, outputExample, fewShotBlock };
  }

  // Get few-shot examples for LLM prompts — format as text block
  async buildFewShotBlock(orgId: string, category?: string, maxPairs = 3): Promise<string> {
    const pool = getPool();
    const conditions = ['org_id = $1', 'is_active = TRUE'];
    const params: unknown[] = [orgId];

    if (category) {
      params.push(category.toUpperCase());
      conditions.push(`category = $${params.length}`);
    }

    const result = await pool.query(
      `SELECT title, input_example, output_example FROM sample_io_pairs
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at
       LIMIT $${params.length + 1}`,
      [...params, maxPairs],
    );

    if (!result.rows.length) return '';

    return result.rows
      .map((row: any, i: number) => `### Example ${i + 1}: ${row.title}
**Input (Requirement):**
\`\`\`json
${JSON.stringify(row.input_example, null, 2)}
\`\`\`
**Expected Output (Test Case):**
\`\`\`json
${JSON.stringify(row.output_example, null, 2)}
\`\`\``)
      .join('\n\n');
  }

  // ── KNOWLEDGE FEEDBACK (Gold Standards) ──────────────────────────────

  async submitFeedback(
    orgId: string,
    projectId: string,
    userId: string,
    dto: {
      testCaseId: string;
      matchPercentage: number;
      notes?: string;
    },
  ) {
    log.info('submitFeedback', { orgId, projectId, userId, testCaseId: dto.testCaseId, matchPercentage: dto.matchPercentage });
    const pool = getPool();

    if (dto.matchPercentage < 0 || dto.matchPercentage > 100) {
      throw new ApiError(400, 'matchPercentage must be between 0 and 100');
    }

    const isGoldStandard = dto.matchPercentage >= 80;
    if (isGoldStandard) {
      log.info('submitFeedback: gold standard threshold met', { testCaseId: dto.testCaseId, matchPercentage: dto.matchPercentage });
    }

    // Insert feedback record
    const feedback = await pool.query(
      `INSERT INTO knowledge_feedback
         (org_id, project_id, test_case_id, user_id, match_percentage, is_gold_standard, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [orgId, projectId, dto.testCaseId, userId, dto.matchPercentage, isGoldStandard, dto.notes || null],
    );

    // Update test_cases table with gold standard flag and match percentage
    await pool.query(
      `UPDATE test_cases
       SET match_percentage = $1,
           is_gold_standard = $2,
           gold_standard_by = CASE WHEN $2 THEN $3::uuid ELSE gold_standard_by END,
           gold_standard_at = CASE WHEN $2 THEN NOW() ELSE gold_standard_at END,
           feedback_notes = COALESCE($4, feedback_notes),
           updated_at = NOW()
       WHERE id = $5 AND project_id = $6`,
      [dto.matchPercentage, isGoldStandard, userId, dto.notes || null, dto.testCaseId, projectId],
    );

    return {
      ...feedback.rows[0],
      isGoldStandard,
      markedGoldStandard: isGoldStandard,
      message: isGoldStandard
        ? 'Test case marked as Gold Standard (≥80% match)'
        : 'Feedback recorded. Gold Standard requires ≥80% match.',
    };
  }

  async getGoldStandardTestCases(projectId: string) {
    log.info('getGoldStandardTestCases', { projectId });
    const pool = getPool();
    const result = await pool.query(
      `SELECT tc.id, tc.title, tc.technique, tc.priority, tc.match_percentage,
              tc.gold_standard_at, tc.feedback_notes,
              u.first_name || ' ' || u.last_name AS gold_standard_by_name
       FROM test_cases tc
       LEFT JOIN users u ON u.id = tc.gold_standard_by
       WHERE tc.project_id = $1 AND tc.is_gold_standard = TRUE
       ORDER BY tc.match_percentage DESC, tc.gold_standard_at DESC`,
      [projectId],
    );
    return result.rows;
  }

  // ── MAPPERS ───────────────────────────────────────────────────────────

  private mapInputTemplate(row: any) {
    return {
      id: row.id,
      orgId: row.org_id,
      name: row.name,
      description: row.description,
      schema: row.schema,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapOutputTemplate(row: any) {
    return {
      id: row.id,
      orgId: row.org_id,
      name: row.name,
      description: row.description,
      schema: row.schema,
      example: row.example,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSamplePair(row: any) {
    return {
      id: row.id,
      orgId: row.org_id,
      title: row.title,
      description: row.description,
      category: row.category,
      inputExample: row.input_example,
      outputExample: row.output_example,
      tags: row.tags,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
