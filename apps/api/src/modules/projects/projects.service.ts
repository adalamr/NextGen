import { getPool } from '../../config/database.config';
import { ApiError } from '../../utils/api-error';

export class ProjectService {
  async getProjects(orgId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, description, slug, org_id, status, llm_endpoint, llm_model, created_at, updated_at
       FROM projects WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [orgId, limit, offset],
    );
    return result.rows.map(this.mapProject);
  }

  async getProject(id: string, orgId: string) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM projects WHERE id = $1 AND org_id = $2',
      [id, orgId],
    );
    if (!result.rows.length) throw new ApiError(404, 'Project not found');
    return this.mapProject(result.rows[0]);
  }

  async createProject(orgId: string, userId: string, dto: any) {
    const pool = getPool();
    const slug = dto.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const result = await pool.query(
      `INSERT INTO projects (name, description, slug, org_id, created_by, llm_endpoint, llm_api_key_encrypted, llm_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [dto.name, dto.description, slug, orgId, userId, dto.llmApiEndpoint, dto.llmApiKey, dto.llmModelName],
    );
    return this.mapProject(result.rows[0]);
  }

  async updateProject(id: string, orgId: string, dto: any) {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        llm_endpoint = COALESCE($4, llm_endpoint),
        llm_model = COALESCE($5, llm_model),
        updated_at = NOW()
       WHERE id = $6 AND org_id = $7 RETURNING *`,
      [dto.name, dto.description, dto.status, dto.llmApiEndpoint, dto.llmModelName, id, orgId],
    );
    if (!result.rows.length) throw new ApiError(404, 'Project not found');
    return this.mapProject(result.rows[0]);
  }

  async deleteProject(id: string, orgId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM projects WHERE id = $1 AND org_id = $2',
      [id, orgId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private mapProject(row: any) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      slug: row.slug,
      orgId: row.org_id,
      status: row.status,
      llmConfig: row.llm_endpoint ? { apiEndpoint: row.llm_endpoint, modelName: row.llm_model } : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
