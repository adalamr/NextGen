import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import { childLogger } from '../../../utils/logger';

const log = childLogger('layer1:app-model');

/**
 * Layer 1 — App Model Service
 * Manages the Digital Twin: API contracts, UI pages, DB schema, User roles.
 * Data is auto-populated by the ingestion worker; also supports manual CRUD.
 */
export class AppModelService {

  // ── API CONTRACTS ─────────────────────────────────────────────────────

  async getApiContracts(projectId: string, search?: string) {
    log.info('getApiContracts', { projectId, search });
    const pool = getPool();
    const params: unknown[] = [projectId];
    let where = 'project_id = $1';

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (endpoint ILIKE $${params.length} OR method ILIKE $${params.length})`;
    }

    const result = await pool.query(
      `SELECT * FROM app_model_api_contracts WHERE ${where} ORDER BY method, endpoint`,
      params,
    );
    return result.rows.map(this.mapApiContract);
  }

  async getApiContract(id: string, projectId: string) {
    log.info('getApiContract', { id, projectId });
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM app_model_api_contracts WHERE id = $1 AND project_id = $2',
      [id, projectId],
    );
    if (!result.rows.length) {
      log.warn('getApiContract: not found', { id, projectId });
      throw new ApiError(404, 'API contract not found');
    }
    return this.mapApiContract(result.rows[0]);
  }

  async upsertApiContract(
    projectId: string,
    dto: {
      endpoint: string;
      method: string;
      params?: Record<string, unknown>;
      schemas?: Record<string, unknown>;
      auth?: Record<string, unknown>;
      rateLimits?: Record<string, unknown>;
      version?: string;
    },
  ) {
    log.info('upsertApiContract', { projectId, method: dto.method, endpoint: dto.endpoint });
    const pool = getPool();
    // Upsert: if same endpoint+method exists for this project, update it
    const result = await pool.query(
      `INSERT INTO app_model_api_contracts
         (project_id, endpoint, method, params, schemas, auth, rate_limits, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        projectId,
        dto.endpoint,
        dto.method.toUpperCase(),
        JSON.stringify(dto.params || {}),
        JSON.stringify(dto.schemas || {}),
        JSON.stringify(dto.auth || {}),
        JSON.stringify(dto.rateLimits || {}),
        dto.version || 'v1',
      ],
    );

    if (!result.rows.length) {
      // Conflict: update instead
      const updated = await pool.query(
        `UPDATE app_model_api_contracts
         SET params = $3, schemas = $4, auth = $5, rate_limits = $6, version = $7, updated_at = NOW()
         WHERE project_id = $1 AND endpoint = $2 AND method = $8
         RETURNING *`,
        [
          projectId,
          dto.endpoint,
          JSON.stringify(dto.params || {}),
          JSON.stringify(dto.schemas || {}),
          JSON.stringify(dto.auth || {}),
          JSON.stringify(dto.rateLimits || {}),
          dto.version || 'v1',
          dto.method.toUpperCase(),
        ],
      );
      return this.mapApiContract(updated.rows[0]);
    }

    return this.mapApiContract(result.rows[0]);
  }

  async deleteApiContract(id: string, projectId: string) {
    log.info('deleteApiContract', { id, projectId });
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM app_model_api_contracts WHERE id = $1 AND project_id = $2 RETURNING id',
      [id, projectId],
    );
    if (!result.rows.length) {
      log.warn('deleteApiContract: not found', { id, projectId });
      throw new ApiError(404, 'API contract not found');
    }
    log.info('deleteApiContract: deleted', { id, projectId });
    return { success: true, id };
  }

  // Bulk upsert — used by ingestion worker
  async bulkUpsertApiContracts(projectId: string, contracts: Array<Record<string, unknown>>) {
    log.info('bulkUpsertApiContracts', { projectId, count: contracts.length });
    const results = await Promise.all(
      contracts.map((c) => this.upsertApiContract(projectId, c as any).catch((e) => ({ error: e.message }))),
    );
    return { inserted: results.filter((r: any) => !r.error).length, total: contracts.length };
  }

  // ── UI PAGES ──────────────────────────────────────────────────────────

  async getPages(projectId: string, search?: string) {
    log.info('getPages', { projectId, search });
    const pool = getPool();
    const params: unknown[] = [projectId];
    let where = 'project_id = $1';

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (name ILIKE $${params.length} OR url_pattern ILIKE $${params.length})`;
    }

    const result = await pool.query(
      `SELECT * FROM app_model_pages WHERE ${where} ORDER BY name`,
      params,
    );
    return result.rows.map(this.mapPage);
  }

  async getPage(id: string, projectId: string) {
    log.info('getPage', { id, projectId });
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM app_model_pages WHERE id = $1 AND project_id = $2',
      [id, projectId],
    );
    if (!result.rows.length) {
      log.warn('getPage: not found', { id, projectId });
      throw new ApiError(404, 'Page not found');
    }
    return this.mapPage(result.rows[0]);
  }

  async upsertPage(
    projectId: string,
    dto: {
      name: string;
      urlPattern?: string;
      elements?: unknown[];
      actions?: unknown[];
      version?: string;
    },
  ) {
    log.info('upsertPage', { projectId, name: dto.name });
    const pool = getPool();

    const existing = await pool.query(
      'SELECT id FROM app_model_pages WHERE project_id = $1 AND name = $2',
      [projectId, dto.name],
    );

    if (existing.rows.length) {
      const result = await pool.query(
        `UPDATE app_model_pages
         SET url_pattern = COALESCE($3, url_pattern),
             elements = $4, actions = $5, version = COALESCE($6, version), updated_at = NOW()
         WHERE id = $7 AND project_id = $1
         RETURNING *`,
        [
          projectId, dto.name,
          dto.urlPattern || null,
          JSON.stringify(dto.elements || []),
          JSON.stringify(dto.actions || []),
          dto.version || 'v1',
          existing.rows[0].id,
        ],
      );
      return this.mapPage(result.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO app_model_pages (project_id, name, url_pattern, elements, actions, version)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        projectId,
        dto.name,
        dto.urlPattern || null,
        JSON.stringify(dto.elements || []),
        JSON.stringify(dto.actions || []),
        dto.version || 'v1',
      ],
    );
    return this.mapPage(result.rows[0]);
  }

  async bulkUpsertPages(projectId: string, pages: Array<Record<string, unknown>>) {
    log.info('bulkUpsertPages', { projectId, count: pages.length });
    const results = await Promise.all(
      pages.map((p) => this.upsertPage(projectId, p as any).catch((e) => ({ error: e.message }))),
    );
    return { inserted: results.filter((r: any) => !r.error).length, total: pages.length };
  }

  // ── DB SCHEMA GRAPH ───────────────────────────────────────────────────

  async getSchemaGraph(projectId: string) {
    log.info('getSchemaGraph', { projectId });
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM app_model_schema_graph WHERE project_id = $1 ORDER BY table_name',
      [projectId],
    );
    return result.rows.map(this.mapSchemaTable);
  }

  async upsertSchemaTable(
    projectId: string,
    dto: {
      tableName: string;
      columns?: unknown[];
      relations?: unknown[];
      constraints?: unknown[];
      indexes?: unknown[];
    },
  ) {
    log.info('upsertSchemaTable', { projectId, tableName: dto.tableName });
    const pool = getPool();

    const existing = await pool.query(
      'SELECT id FROM app_model_schema_graph WHERE project_id = $1 AND table_name = $2',
      [projectId, dto.tableName],
    );

    if (existing.rows.length) {
      const result = await pool.query(
        `UPDATE app_model_schema_graph
         SET columns = $3, relations = $4, constraints = $5, indexes = $6
         WHERE id = $7 RETURNING *`,
        [
          projectId, dto.tableName,
          JSON.stringify(dto.columns || []),
          JSON.stringify(dto.relations || []),
          JSON.stringify(dto.constraints || []),
          JSON.stringify(dto.indexes || []),
          existing.rows[0].id,
        ],
      );
      return this.mapSchemaTable(result.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO app_model_schema_graph (project_id, table_name, columns, relations, constraints, indexes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        projectId, dto.tableName,
        JSON.stringify(dto.columns || []),
        JSON.stringify(dto.relations || []),
        JSON.stringify(dto.constraints || []),
        JSON.stringify(dto.indexes || []),
      ],
    );
    return this.mapSchemaTable(result.rows[0]);
  }

  async bulkUpsertSchemaTables(projectId: string, tables: Array<Record<string, unknown>>) {
    log.info('bulkUpsertSchemaTables', { projectId, count: tables.length });
    const results = await Promise.all(
      tables.map((t) => this.upsertSchemaTable(projectId, t as any).catch((e) => ({ error: e.message }))),
    );
    return { inserted: results.filter((r: any) => !r.error).length, total: tables.length };
  }

  // ── USER ROLES ────────────────────────────────────────────────────────

  async getUserRoles(projectId: string) {
    log.info('getUserRoles', { projectId });
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM app_model_user_roles WHERE project_id = $1 ORDER BY role_name',
      [projectId],
    );
    return result.rows.map(this.mapUserRole);
  }

  async upsertUserRole(
    projectId: string,
    dto: { roleName: string; permissions?: string[]; description?: string; version?: string },
  ) {
    log.info('upsertUserRole', { projectId, roleName: dto.roleName });
    const pool = getPool();

    const existing = await pool.query(
      'SELECT id FROM app_model_user_roles WHERE project_id = $1 AND role_name = $2',
      [projectId, dto.roleName],
    );

    if (existing.rows.length) {
      const result = await pool.query(
        `UPDATE app_model_user_roles
         SET permissions = $3, description = COALESCE($4, description),
             version = COALESCE($5, version), updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [
          projectId, dto.roleName,
          JSON.stringify(dto.permissions || []),
          dto.description || null,
          dto.version || 'v1',
          existing.rows[0].id,
        ],
      );
      return this.mapUserRole(result.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO app_model_user_roles (project_id, role_name, permissions, description, version)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        projectId, dto.roleName,
        JSON.stringify(dto.permissions || []),
        dto.description || null,
        dto.version || 'v1',
      ],
    );
    return this.mapUserRole(result.rows[0]);
  }

  // ── SUMMARY (used by LLM context injection) ───────────────────────────
  async getSummary(projectId: string): Promise<string> {
    log.info('getSummary', { projectId });
    const pool = getPool();

    const [apis, pages, tables, roles] = await Promise.all([
      pool.query('SELECT method, endpoint FROM app_model_api_contracts WHERE project_id = $1 ORDER BY method, endpoint LIMIT 30', [projectId]),
      pool.query('SELECT name, url_pattern FROM app_model_pages WHERE project_id = $1 ORDER BY name LIMIT 20', [projectId]),
      pool.query('SELECT table_name FROM app_model_schema_graph WHERE project_id = $1 ORDER BY table_name LIMIT 20', [projectId]),
      pool.query('SELECT role_name FROM app_model_user_roles WHERE project_id = $1 ORDER BY role_name', [projectId]),
    ]);

    const parts: string[] = [];

    if (apis.rows.length) {
      parts.push(`## API Endpoints (${apis.rows.length})\n` +
        apis.rows.map((r: any) => `${r.method} ${r.endpoint}`).join('\n'));
    }
    if (pages.rows.length) {
      parts.push(`## UI Pages (${pages.rows.length})\n` +
        pages.rows.map((r: any) => `${r.name} → ${r.url_pattern || 'no URL'}`).join('\n'));
    }
    if (tables.rows.length) {
      parts.push(`## Database Tables (${tables.rows.length})\n` +
        tables.rows.map((r: any) => r.table_name).join(', '));
    }
    if (roles.rows.length) {
      parts.push(`## User Roles\n` + roles.rows.map((r: any) => r.role_name).join(', '));
    }

    return parts.length ? parts.join('\n\n') : 'No app model defined yet.';
  }

  // ── MAPPERS ───────────────────────────────────────────────────────────

  private mapApiContract(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      endpoint: row.endpoint,
      method: row.method,
      params: row.params,
      schemas: row.schemas,
      auth: row.auth,
      rateLimits: row.rate_limits,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapPage(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      urlPattern: row.url_pattern,
      elements: row.elements,
      actions: row.actions,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSchemaTable(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      tableName: row.table_name,
      columns: row.columns,
      relations: row.relations,
      constraints: row.constraints,
      indexes: row.indexes,
      createdAt: row.created_at,
    };
  }

  private mapUserRole(row: any) {
    return {
      id: row.id,
      projectId: row.project_id,
      roleName: row.role_name,
      permissions: row.permissions,
      description: row.description,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
