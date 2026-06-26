import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';

/**
 * Layer 4 — CI/CD Integration Service
 *
 * Manages CI/CD provider integrations (Azure DevOps, Jenkins) and
 * exposes a webhook endpoint that external pipelines call to trigger
 * test execution runs.
 */
export class CicdService {

  // ── LIST INTEGRATIONS ─────────────────────────────────────────────────
  async listIntegrations(projectId: string) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM cicd_integrations WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId],
    );
    return result.rows.map(this.mapIntegration);
  }

  // ── GET INTEGRATION ───────────────────────────────────────────────────
  async getIntegration(id: string, projectId: string) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM cicd_integrations WHERE id = $1 AND project_id = $2',
      [id, projectId],
    );
    if (!result.rows.length) throw new ApiError(404, 'CI/CD integration not found');
    return this.mapIntegration(result.rows[0]);
  }

  // ── CREATE INTEGRATION ────────────────────────────────────────────────
  async createIntegration(projectId: string, dto: {
    provider: 'AZURE_DEVOPS' | 'JENKINS' | 'GITHUB_ACTIONS' | 'GITLAB_CI';
    config: Record<string, unknown>;
  }) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO cicd_integrations (project_id, provider, config)
       VALUES ($1, $2, $3) RETURNING *`,
      [projectId, dto.provider, JSON.stringify(dto.config)],
    );
    return this.mapIntegration(result.rows[0]);
  }

  // ── UPDATE INTEGRATION ────────────────────────────────────────────────
  async updateIntegration(id: string, projectId: string, dto: {
    config?: Record<string, unknown>;
    isActive?: boolean;
  }) {
    const pool = getPool();
    const updates: string[] = [];
    const params: unknown[] = [];

    if (dto.config   !== undefined) { params.push(JSON.stringify(dto.config)); updates.push(`config = $${params.length}`); }
    if (dto.isActive !== undefined) { params.push(dto.isActive); updates.push(`is_active = $${params.length}`); }

    if (!updates.length) throw new ApiError(400, 'No fields to update');

    params.push(id, projectId);
    const result = await pool.query(
      `UPDATE cicd_integrations SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND project_id = $${params.length} RETURNING *`,
      params,
    );
    if (!result.rows.length) throw new ApiError(404, 'CI/CD integration not found');
    return this.mapIntegration(result.rows[0]);
  }

  // ── WEBHOOK TRIGGER ───────────────────────────────────────────────────
  // Called by external CI pipelines.  Validates the secret token stored
  // in the integration config and returns the projectId for the runner.
  async handleWebhookTrigger(
    integrationId: string,
    payload: {
      event:        string;   // push | pr_merged | deployment
      ref?:         string;   // branch / tag
      commitSha?:   string;
      environment?: string;   // target environment name
      secret:       string;
    },
  ) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM cicd_integrations WHERE id = $1 AND is_active = TRUE',
      [integrationId],
    );
    if (!result.rows.length) throw new ApiError(404, 'Integration not found or inactive');

    const integration = result.rows[0];
    const config = integration.config as Record<string, string>;

    // Validate shared secret
    if (config.webhookSecret && config.webhookSecret !== payload.secret) {
      throw new ApiError(401, 'Invalid webhook secret');
    }

    // Return metadata so the caller (route handler) can trigger the run
    return {
      projectId:    integration.project_id as string,
      provider:     integration.provider   as string,
      event:        payload.event,
      ref:          payload.ref ?? null,
      commitSha:    payload.commitSha ?? null,
      environment:  payload.environment ?? null,
    };
  }

  // ── MAPPER ────────────────────────────────────────────────────────────
  private mapIntegration(row: any) {
    return {
      id:        row.id,
      projectId: row.project_id,
      provider:  row.provider,
      isActive:  row.is_active,
      // Mask secrets from config before returning
      config:    this.maskSecrets(row.config ?? {}),
      createdAt: row.created_at,
    };
  }

  private maskSecrets(config: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['apiKey', 'token', 'password', 'secret', 'webhookSecret'];
    return Object.fromEntries(
      Object.entries(config).map(([k, v]) =>
        sensitiveKeys.some((s) => k.toLowerCase().includes(s.toLowerCase()))
          ? [k, '***']
          : [k, v],
      ),
    );
  }
}
