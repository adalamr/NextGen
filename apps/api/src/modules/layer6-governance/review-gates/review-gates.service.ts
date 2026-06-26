import { getPool } from '../../../config/database.config';

/**
 * Layer 6 - Review Gates Service
 * QA Leads and System Owners approve/reject:
 * - Generated test cases
 * - Self-healing proposals
 * - Script changes
 * - Coverage reports
 */
export class ReviewGatesService {
  async getPendingReviews(orgId: string, userId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT rg.*, p.name AS project_name
       FROM review_gates rg
       JOIN projects p ON p.id = rg.project_id
       WHERE p.org_id = $1
         AND rg.status = 'PENDING'
         AND (rg.assigned_to = $2 OR rg.assigned_to IS NULL)
       ORDER BY rg.priority DESC, rg.created_at ASC`,
      [orgId, userId],
    );
    return result.rows;
  }

  async getReviewGate(id: string) {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM review_gates WHERE id = $1', [id]);
    return result.rows[0];
  }

  async createReviewGate(dto: {
    projectId: string;
    type: 'TEST_CASE_APPROVAL' | 'HEALING_PROPOSAL' | 'SCRIPT_CHANGE' | 'COVERAGE_SIGN_OFF';
    referenceId: string;
    title: string;
    description?: string;
    priority?: string;
    assignedTo?: string;
  }) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO review_gates (project_id, type, reference_id, title, description, priority, assigned_to, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING') RETURNING *`,
      [dto.projectId, dto.type, dto.referenceId, dto.title, dto.description, dto.priority || 'MEDIUM', dto.assignedTo],
    );
    return result.rows[0];
  }

  async approve(id: string, userId: string, comments?: string) {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE review_gates
       SET status = 'APPROVED', reviewed_by = $1, comments = $2, reviewed_at = NOW()
       WHERE id = $3 RETURNING *`,
      [userId, comments, id],
    );
    return result.rows[0];
  }

  async reject(id: string, userId: string, reason: string) {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE review_gates
       SET status = 'REJECTED', reviewed_by = $1, reject_reason = $2, reviewed_at = NOW()
       WHERE id = $3 RETURNING *`,
      [userId, reason, id],
    );
    return result.rows[0];
  }

  async getStats(orgId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE rg.status = 'PENDING') AS pending,
         COUNT(*) FILTER (WHERE rg.status = 'APPROVED') AS approved,
         COUNT(*) FILTER (WHERE rg.status = 'REJECTED') AS rejected,
         COUNT(*) AS total
       FROM review_gates rg
       JOIN projects p ON p.id = rg.project_id
       WHERE p.org_id = $1`,
      [orgId],
    );
    return result.rows[0];
  }
}
