import { Queue } from 'bullmq';
import { getPool } from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';

let _execQueue: Queue | null = null;
function getExecQueue(): Queue {
  if (!_execQueue) {
    _execQueue = new Queue('layer4:execution', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null,
      },
    });
  }
  return _execQueue;
}

/**
 * Layer 4 — Runner Service
 *
 * Triggers test execution runs and tracks their progress + results.
 * Actual execution happens in the layer4 BullMQ worker (execution.processor).
 */
export class RunnerService {

  // ── TRIGGER A RUN ─────────────────────────────────────────────────────
  async triggerRun(dto: {
    projectId: string;
    environmentId: string;
    scriptIds?: string[];     // optional: run specific scripts
    runnerType?: string;      // UI | API | PERFORMANCE | OTHER
    triggerType?: string;     // MANUAL | CICD | SCHEDULED
    userId: string;
  }) {
    const pool = getPool();

    // Verify environment
    const envResult = await pool.query(
      'SELECT id, config FROM environments WHERE id = $1 AND project_id = $2 AND is_active = TRUE',
      [dto.environmentId, dto.projectId],
    );
    if (!envResult.rows.length) throw new ApiError(404, 'Environment not found or inactive');

    // Determine scripts to run
    let scriptIds: string[] = dto.scriptIds ?? [];
    if (!scriptIds.length) {
      const scriptsResult = await pool.query(
        `SELECT id FROM scripts WHERE project_id = $1 AND status = 'GENERATED' ORDER BY created_at DESC LIMIT 200`,
        [dto.projectId],
      );
      scriptIds = scriptsResult.rows.map((r: any) => r.id);
    }

    if (!scriptIds.length) throw new ApiError(400, 'No scripts available to run');

    // Create execution run record
    const runResult = await pool.query(
      `INSERT INTO execution_runs
         (project_id, environment_id, triggered_by, trigger_type, status, runner_type, total_tests)
       VALUES ($1, $2, $3, $4, 'QUEUED', $5, $6) RETURNING *`,
      [
        dto.projectId,
        dto.environmentId,
        dto.userId,
        dto.triggerType || 'MANUAL',
        dto.runnerType  || 'UI',
        scriptIds.length,
      ],
    );
    const run = runResult.rows[0];

    // Enqueue the execution job
    const queue = getExecQueue();
    await queue.add(
      `run-${run.id}`,
      {
        runId:         run.id,
        projectId:     dto.projectId,
        environmentId: dto.environmentId,
        scriptIds,
        envConfig:     envResult.rows[0].config,
        runnerType:    dto.runnerType || 'UI',
      },
      { attempts: 1 },
    );

    return this.mapRun(run);
  }

  // ── LIST RUNS ─────────────────────────────────────────────────────────
  async listRuns(
    projectId: string,
    filters: { environmentId?: string; status?: string; page?: number; limit?: number } = {},
  ) {
    const pool = getPool();
    const page  = Math.max(1, filters.page  || 1);
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

    const conditions = ['er.project_id = $1'];
    const params: unknown[] = [projectId];

    if (filters.environmentId) { params.push(filters.environmentId); conditions.push(`er.environment_id = $${params.length}`); }
    if (filters.status)        { params.push(filters.status.toUpperCase()); conditions.push(`er.status = $${params.length}`); }

    const where = conditions.join(' AND ');

    const [rows, countRows] = await Promise.all([
      pool.query(
        `SELECT er.*, e.name AS env_name, u.email AS triggered_by_email
         FROM execution_runs er
         LEFT JOIN environments e ON e.id = er.environment_id
         LEFT JOIN users u ON u.id = er.triggered_by
         WHERE ${where}
         ORDER BY er.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      pool.query(`SELECT COUNT(*) FROM execution_runs er WHERE ${where}`, params),
    ]);

    return {
      runs:  rows.rows.map(this.mapRun),
      total: parseInt(countRows.rows[0].count, 10),
      page,
      limit,
    };
  }

  // ── GET RUN DETAILS ───────────────────────────────────────────────────
  async getRun(runId: string, projectId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT er.*, e.name AS env_name
       FROM execution_runs er
       LEFT JOIN environments e ON e.id = er.environment_id
       WHERE er.id = $1 AND er.project_id = $2`,
      [runId, projectId],
    );
    if (!result.rows.length) throw new ApiError(404, 'Execution run not found');
    return this.mapRun(result.rows[0]);
  }

  // ── GET RUN RESULTS ───────────────────────────────────────────────────
  async getRunResults(runId: string, projectId: string) {
    const pool = getPool();

    // Verify run belongs to project
    const runCheck = await pool.query('SELECT id FROM execution_runs WHERE id = $1 AND project_id = $2', [runId, projectId]);
    if (!runCheck.rows.length) throw new ApiError(404, 'Execution run not found');

    const results = await pool.query(
      `SELECT exr.*, s.framework, tc.title AS test_case_title
       FROM execution_results exr
       LEFT JOIN scripts s ON s.id = exr.script_id
       LEFT JOIN test_cases tc ON tc.id = exr.test_case_id
       WHERE exr.run_id = $1
       ORDER BY exr.created_at`,
      [runId],
    );

    return results.rows.map((r: any) => ({
      id:            r.id,
      runId:         r.run_id,
      scriptId:      r.script_id,
      testCaseId:    r.test_case_id,
      testCaseTitle: r.test_case_title,
      framework:     r.framework,
      status:        r.status,
      durationMs:    r.duration_ms,
      errorMessage:  r.error_message,
      stackTrace:    r.stack_trace,
      artifacts:     r.artifacts ?? [],
      createdAt:     r.created_at,
    }));
  }

  // ── MAPPER ────────────────────────────────────────────────────────────
  private mapRun(row: any) {
    return {
      id:               row.id,
      projectId:        row.project_id,
      environmentId:    row.environment_id,
      envName:          row.env_name    ?? null,
      triggeredBy:      row.triggered_by,
      triggeredByEmail: row.triggered_by_email ?? null,
      triggerType:      row.trigger_type,
      status:           row.status,
      runnerType:       row.runner_type,
      totalTests:       row.total_tests,
      passed:           row.passed,
      failed:           row.failed,
      skipped:          row.skipped,
      durationMs:       row.duration_ms,
      startedAt:        row.started_at,
      completedAt:      row.completed_at,
      createdAt:        row.created_at,
    };
  }
}
