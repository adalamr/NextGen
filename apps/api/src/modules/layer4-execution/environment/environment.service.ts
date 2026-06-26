import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';

/**
 * Layer 4 — Environment Service
 *
 * Manages test environments (DEV, QA, STAGING, PROD) and their configuration.
 */
export class EnvironmentService {

  async listEnvironments(projectId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM environments WHERE project_id = $1 ORDER BY type, name`,
      [projectId],
    );
    return result.rows.map(this.mapEnv);
  }

  async getEnvironment(id: string, projectId: string) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM environments WHERE id = $1 AND project_id = $2',
      [id, projectId],
    );
    if (!result.rows.length) throw new ApiError(404, 'Environment not found');
    return this.mapEnv(result.rows[0]);
  }

  async createEnvironment(projectId: string, dto: {
    name: string;
    type: 'DEV' | 'QA' | 'STAGING' | 'PROD';
    config?: Record<string, unknown>;
  }) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO environments (project_id, name, type, config)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [projectId, dto.name, dto.type, JSON.stringify(dto.config ?? {})],
    );
    return this.mapEnv(result.rows[0]);
  }

  async updateEnvironment(id: string, projectId: string, dto: {
    name?: string;
    type?: string;
    config?: Record<string, unknown>;
    isActive?: boolean;
  }) {
    const pool = getPool();

    const updates: string[] = [];
    const params: unknown[] = [];

    if (dto.name !== undefined) { params.push(dto.name); updates.push(`name = $${params.length}`); }
    if (dto.type !== undefined) { params.push(dto.type); updates.push(`type = $${params.length}`); }
    if (dto.config !== undefined) { params.push(JSON.stringify(dto.config)); updates.push(`config = $${params.length}`); }
    if (dto.isActive !== undefined) { params.push(dto.isActive); updates.push(`is_active = $${params.length}`); }

    if (!updates.length) throw new ApiError(400, 'No fields to update');

    params.push(id, projectId);
    const result = await pool.query(
      `UPDATE environments SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND project_id = $${params.length} RETURNING *`,
      params,
    );
    if (!result.rows.length) throw new ApiError(404, 'Environment not found');
    return this.mapEnv(result.rows[0]);
  }

  async deleteEnvironment(id: string, projectId: string) {
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM environments WHERE id = $1 AND project_id = $2 RETURNING id',
      [id, projectId],
    );
    if (!result.rows.length) throw new ApiError(404, 'Environment not found');
    return { id };
  }

  private mapEnv(row: any) {
    return {
      id:        row.id,
      projectId: row.project_id,
      name:      row.name,
      type:      row.type,
      config:    row.config ?? {},
      isActive:  row.is_active,
      createdAt: row.created_at,
    };
  }
}
