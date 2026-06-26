/**
 * Unit tests — FeedbackService
 *
 * Coverage targets:
 *  ✅ submitFeedback — success → feedback stored, matchPercentage calculated
 *  ✅ submitFeedback — score >= 80 → gold_standard_candidate = TRUE
 *  ✅ submitFeedback — score < 50  → gold_standard stripped
 *  ✅ submitFeedback — duplicate submission → ApiError 409
 *  ✅ submitFeedback — requester mismatch  → ApiError 403
 *  ✅ submitFeedback — test case not found → ApiError 404
 *  ✅ submitFeedback — invalid score values → ApiError 400
 *  ✅ getFeedback   — returns all feedback entries for a test case
 *  ✅ getFeedback   — test case not found → ApiError 404
 *  ✅ getPromptContext — no feedback → zero averages, empty weaknesses
 *  ✅ getPromptContext — low scores  → weaknesses detected, hint populated
 *  ✅ matchPercentage formula: ((c + co + cv) / 15) * 100
 */

import '../../../__tests__/helpers/redis.helper';

import { DbHelper } from '../../../__tests__/helpers/db.helper';
import { FeedbackService } from '../../../modules/layer1-context/feedback/feedback.service';
import * as dbConfig from '../../../config/database.config';
import { v4 as uuid } from 'uuid';

jest.mock('../../../config/database.config', () => ({ getPool: jest.fn() }));
jest.mock('../../../utils/logger', () => ({
  childLogger: () => ({
    info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(),
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────
async function seedTestCase(
  pool: any,
  projectId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  const id = uuid();
  await pool.query(
    `INSERT INTO test_cases
       (id, project_id, title, technique, priority, created_by,
        is_gold_standard, gold_standard_candidate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id, projectId,
      overrides.title ?? 'Test Login',
      overrides.technique ?? 'EQUIVALENCE',
      overrides.priority ?? 'MEDIUM',
      overrides.created_by ?? userId,
      overrides.is_gold_standard ?? false,
      overrides.gold_standard_candidate ?? false,
    ],
  );
  return id;
}

// ── Test suite ───────────────────────────────────────────────────────────────
describe('FeedbackService', () => {
  let helper: DbHelper;
  let svc: FeedbackService;
  let pool: ReturnType<DbHelper['getPool']>;
  let testCaseId: string;

  beforeEach(async () => {
    helper = new DbHelper();
    await helper.setup();
    pool = helper.getPool();
    (dbConfig.getPool as jest.Mock).mockReturnValue(pool);
    svc = new FeedbackService();
    testCaseId = await seedTestCase(pool, helper.projectId, helper.userId);
  });

  afterEach(() => {
    helper.teardown();
  });

  // ── matchPercentage formula ──────────────────────────────────────────────
  describe('matchPercentage formula', () => {
    it('calculates correctly for mid-range scores (3,3,3) → 60%', async () => {
      const result = await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 3, correctness: 3, coverage: 3 },
      );
      expect(result.matchPercentage).toBe(60);
    });

    it('calculates 100% for perfect scores (5,5,5)', async () => {
      const result = await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 5, correctness: 5, coverage: 5 },
      );
      expect(result.matchPercentage).toBe(100);
    });

    it('calculates 20% for minimum scores (1,1,1)', async () => {
      const result = await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 1, correctness: 1, coverage: 1 },
      );
      expect(result.matchPercentage).toBe(20);
    });

    it('calculates exactly 80% threshold for (4,4,4)', async () => {
      const result = await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 4, correctness: 4, coverage: 4 },
      );
      expect(result.matchPercentage).toBe(80);
      expect(result.isGoldStandardCandidate).toBe(true);
    });
  });

  // ── submitFeedback success ───────────────────────────────────────────────
  describe('submitFeedback — success', () => {
    it('stores feedback and returns the mapped record', async () => {
      const result = await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 3, correctness: 4, coverage: 3, notes: 'Looks good' },
      );

      expect(result.testCaseId).toBe(testCaseId);
      expect(result.userId).toBe(helper.userId);
      expect(result.clarity).toBe(3);
      expect(result.correctness).toBe(4);
      expect(result.coverage).toBe(3);
      expect(result.notes).toBe('Looks good');
      expect(result.matchPercentage).toBeDefined();
      expect(result.message).toBeDefined();
    });

    it('persists feedback to knowledge_feedback table', async () => {
      await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 3, correctness: 3, coverage: 3 },
      );
      const rows = await pool.query(
        'SELECT * FROM knowledge_feedback WHERE test_case_id = $1',
        [testCaseId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].clarity).toBe(3);
    });
  });

  // ── Gold Standard candidate promotion ────────────────────────────────────
  describe('submitFeedback — gold standard candidate (score ≥ 80%)', () => {
    it('sets gold_standard_candidate=TRUE on test_cases when matchPercentage >= 80', async () => {
      await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 4, correctness: 4, coverage: 4 }, // 80%
      );

      const row = await pool.query(
        'SELECT gold_standard_candidate FROM test_cases WHERE id = $1',
        [testCaseId],
      );
      expect(row.rows[0].gold_standard_candidate).toBe(true);
    });

    it('returns isGoldStandardCandidate=true and appropriate message', async () => {
      const result = await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 5, correctness: 5, coverage: 5 }, // 100%
      );
      expect(result.isGoldStandardCandidate).toBe(true);
      expect(result.message).toContain('Gold Standard');
    });
  });

  // ── Low quality — strip gold standard ────────────────────────────────────
  describe('submitFeedback — low quality (score < 50%)', () => {
    it('returns isLowQuality=true for score below 50%', async () => {
      const result = await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 2, correctness: 2, coverage: 2 }, // 40%
      );
      expect(result.isLowQuality).toBe(true);
    });

    it('revokes gold_standard on test case if previously set', async () => {
      // Pre-set the test case as gold standard
      await pool.query(
        `UPDATE test_cases SET is_gold_standard = TRUE WHERE id = $1`,
        [testCaseId],
      );

      await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 1, correctness: 1, coverage: 1 }, // 20%
      );

      const row = await pool.query(
        'SELECT is_gold_standard FROM test_cases WHERE id = $1',
        [testCaseId],
      );
      expect(row.rows[0].is_gold_standard).toBe(false);
    });

    it('removes knowledge_vector entry when gold standard is stripped', async () => {
      // Insert a gold standard knowledge vector for this test case
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,doc_id,content)
         VALUES($1,$2,$3,$4,$5)`,
        [uuid(), helper.projectId, 'gold_standard_test_case', testCaseId, '{"title":"test"}'],
      );

      await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 1, correctness: 1, coverage: 1 }, // 20%
      );

      const kv = await pool.query(
        `SELECT id FROM knowledge_vectors WHERE doc_id = $1 AND doc_type = 'gold_standard_test_case'`,
        [testCaseId],
      );
      expect(kv.rows).toHaveLength(0);
    });
  });

  // ── Duplicate submission guard ────────────────────────────────────────────
  describe('submitFeedback — duplicate rejection', () => {
    it('throws ApiError 409 on second submission from same user', async () => {
      await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 3, correctness: 3, coverage: 3 },
      );
      await expect(
        svc.submitFeedback(
          testCaseId, helper.projectId, helper.userId,
          { clarity: 5, correctness: 5, coverage: 5 },
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  // ── Requester mismatch guard ──────────────────────────────────────────────
  describe('submitFeedback — requester mismatch', () => {
    it('throws ApiError 403 when userId does not match created_by', async () => {
      // Test case owned by helper.userId, submitted by a different user
      const otherId = uuid();
      await pool.query(
        `INSERT INTO users(id,email,password_hash,org_id)
         VALUES($1,$2,$3,$4)`,
        [otherId, 'other@test.com', 'hash', helper.orgId],
      );

      await expect(
        svc.submitFeedback(
          testCaseId, helper.projectId, otherId,
          { clarity: 3, correctness: 3, coverage: 3 },
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ── Not found guard ───────────────────────────────────────────────────────
  describe('submitFeedback — test case not found', () => {
    it('throws ApiError 404 for unknown testCaseId', async () => {
      await expect(
        svc.submitFeedback(
          uuid(), helper.projectId, helper.userId,
          { clarity: 3, correctness: 3, coverage: 3 },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws ApiError 404 for testCaseId in different project', async () => {
      const otherId = uuid();
      await pool.query(
        `INSERT INTO projects(id,org_id,name,slug,created_by) VALUES($1,$2,$3,$4,$5)`,
        [otherId, helper.orgId, 'Other', 'other5', helper.userId],
      );
      await expect(
        svc.submitFeedback(
          testCaseId, otherId, helper.userId,
          { clarity: 3, correctness: 3, coverage: 3 },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── Score validation ──────────────────────────────────────────────────────
  describe('submitFeedback — input validation', () => {
    const invalid = [
      { clarity: 0, correctness: 3, coverage: 3 },  // below 1
      { clarity: 6, correctness: 3, coverage: 3 },  // above 5
      { clarity: 1.5, correctness: 3, coverage: 3 }, // non-integer
      { clarity: 'a' as any, correctness: 3, coverage: 3 }, // wrong type
    ];

    invalid.forEach((dto) => {
      it(`throws ApiError 400 for invalid score: ${JSON.stringify(dto)}`, async () => {
        await expect(
          svc.submitFeedback(testCaseId, helper.projectId, helper.userId, dto),
        ).rejects.toMatchObject({ statusCode: 400 });
      });
    });
  });

  // ── getFeedback ───────────────────────────────────────────────────────────
  describe('getFeedback', () => {
    it('returns an empty array when no feedback exists', async () => {
      const result = await svc.getFeedback(testCaseId, helper.projectId);
      expect(result).toEqual([]);
    });

    it('returns feedback after submission', async () => {
      await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 4, correctness: 3, coverage: 5 },
      );
      const result = await svc.getFeedback(testCaseId, helper.projectId);
      expect(result).toHaveLength(1);
      expect(result[0].clarity).toBe(4);
      expect(result[0].correctness).toBe(3);
      expect(result[0].coverage).toBe(5);
    });

    it('throws ApiError 404 when test case not found', async () => {
      await expect(
        svc.getFeedback(uuid(), helper.projectId),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── getPromptContext ──────────────────────────────────────────────────────
  describe('getPromptContext', () => {
    it('returns zero averages and empty weaknesses when no feedback', async () => {
      const ctx = await svc.getPromptContext(helper.projectId);
      expect(ctx.avgClarity).toBe(0);
      expect(ctx.avgCorrectness).toBe(0);
      expect(ctx.avgCoverage).toBe(0);
      expect(ctx.weaknesses).toHaveLength(0);
      expect(ctx.promptHint).toBe('');
    });

    it('detects weaknesses when average scores < 3', async () => {
      // Submit multiple low-scoring feedback entries
      const tc2 = await seedTestCase(pool, helper.projectId, helper.userId);
      const userId2 = uuid();
      await pool.query(
        `INSERT INTO users(id,email,password_hash,org_id) VALUES($1,$2,$3,$4)`,
        [userId2, 'u2@test.com', 'hash', helper.orgId],
      );

      // First feedback (created_by = helper.userId) uses helper.userId
      await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 1, correctness: 1, coverage: 1 },
      );
      // Second test case (created_by = userId2) uses userId2
      await pool.query(
        `UPDATE test_cases SET created_by = $1 WHERE id = $2`,
        [userId2, tc2],
      );
      await svc.submitFeedback(
        tc2, helper.projectId, userId2,
        { clarity: 2, correctness: 2, coverage: 2 },
      );

      const ctx = await svc.getPromptContext(helper.projectId);
      expect(ctx.weaknesses.length).toBeGreaterThan(0);
      expect(ctx.promptHint).not.toBe('');
      expect(ctx.promptHint).toContain('IMPORTANT');
    });

    it('returns no weaknesses when all averages are >= 3', async () => {
      await svc.submitFeedback(
        testCaseId, helper.projectId, helper.userId,
        { clarity: 4, correctness: 4, coverage: 4 },
      );

      const ctx = await svc.getPromptContext(helper.projectId);
      expect(ctx.weaknesses).toHaveLength(0);
      expect(ctx.promptHint).toBe('');
    });
  });
});
