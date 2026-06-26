import { getPool } from '../../../config/database.config';

/**
 * Layer 5 - Self-Healing Service
 * Detects UI changes, proposes new locators from App Model (POM)
 * Human approves via Layer 6 Review Gates
 */
export class SelfHealingService {
  async getHealingProposals(projectId: string, status?: string) {
    const pool = getPool();
    let query = `SELECT * FROM healing_proposals WHERE project_id = $1`;
    const params: any[] = [projectId];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  async createHealingProposal(dto: {
    projectId: string;
    scriptId: string;
    brokenLocator: string;
    proposedLocator: string;
    confidence: number;
    reason: string;
  }) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO healing_proposals
         (project_id, script_id, broken_locator, proposed_locator, confidence, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING_REVIEW') RETURNING *`,
      [dto.projectId, dto.scriptId, dto.brokenLocator, dto.proposedLocator, dto.confidence, dto.reason],
    );
    return result.rows[0];
  }

  async approveProposal(proposalId: string, userId: string) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const proposal = await client.query(
        `UPDATE healing_proposals SET status = 'APPROVED', approved_by = $1, approved_at = NOW()
         WHERE id = $2 RETURNING *`,
        [userId, proposalId],
      );

      // Apply the healing: update the script with new locator
      if (proposal.rows.length) {
        const p = proposal.rows[0];
        await client.query(
          `UPDATE scripts SET content = REPLACE(content, $1, $2), updated_at = NOW()
           WHERE id = $3`,
          [p.broken_locator, p.proposed_locator, p.script_id],
        );
      }

      await client.query('COMMIT');
      return proposal.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async rejectProposal(proposalId: string, userId: string, reason: string) {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE healing_proposals SET status = 'REJECTED', rejected_by = $1, reject_reason = $2
       WHERE id = $3 RETURNING *`,
      [userId, reason, proposalId],
    );
    return result.rows[0];
  }
}
