/**
 * Unit tests — TraceabilityService
 *
 * Coverage targets:
 *  ✅ getMatrix           — returns all requirements, techniques[], coverageStatus
 *  ✅ getMatrix           — empty project → empty requirements, summary zeroed
 *  ✅ getRequirementRow   — found by UUID, by externalId, includes testCases[]
 *  ✅ getRequirementRow   — 404 for unknown UUID / wrong project
 *  ✅ getCoverageAggregate — correct pct, covered/partial/notCovered counts
 *  ✅ linkTestCases       — links multiple TCs, skips unknown IDs
 *  ✅ linkTestCases       — throws 400 on empty array, 404 on missing req
 *  ✅ linkTestCases       — ON CONFLICT DO NOTHING (duplicate silent)
 *  ✅ linkDefect          — creates link, returns alreadyLinked=false
 *  ✅ linkDefect          — returns alreadyLinked=true on conflict
 *  ✅ linkDefect          — throws 400 on empty defectId, 404 on missing req
 *  ✅ createLink          — generic link creation, ON CONFLICT DO NOTHING
 *  ✅ coverage formula:   CRITICAL=3 techniques, HIGH=2, MEDIUM/LOW=1
 */

import '../../../__tests__/helpers/redis.helper';

import { DbHelper } from '../../../__tests__/helpers/db.helper';
import { TraceabilityService } from '../../../modules/layer1-context/traceability/traceability.service';
import * as dbConfig from '../../../config/database.config';
import { v4 as uuid } from 'uuid';

jest.mock('../../../config/database.config', () => ({ getPool: jest.fn() }));
jest.mock('../../../utils/logger', () => ({
  childLogger: () => ({
    info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(),
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
async function seedRequirement(
  pool: any, projectId: string, priority = 'MEDIUM', externalId?: string,
) {
  const id = uuid();
  await pool.query(
    `INSERT INTO requirements(id,project_id,title,priority,external_id)
     VALUES($1,$2,$3,$4,$5)`,
    [id, projectId, `Req ${id.slice(0, 8)}`, priority, externalId ?? null],
  );
  return id;
}

async function seedTestCase(
  pool: any, projectId: string, technique = 'EQUIVALENCE',
) {
  const id = uuid();
  await pool.query(
    `INSERT INTO test_cases(id,project_id,title,technique)
     VALUES($1,$2,$3,$4)`,
    [id, projectId, `TC ${id.slice(0, 8)}`, technique],
  );
  return id;
}

// ── Test suite ───────────────────────────────────────────────────────────────
describe('TraceabilityService', () => {
  let helper: DbHelper;
  let svc: TraceabilityService;
  let pool: ReturnType<DbHelper['getPool']>;

  beforeEach(async () => {
    helper = new DbHelper();
    await helper.setup();
    pool = helper.getPool();
    (dbConfig.getPool as jest.Mock).mockReturnValue(pool);
    svc = new TraceabilityService();
  });

  afterEach(() => {
    helper.teardown();
  });

  // ── getMatrix ────────────────────────────────────────────────────────────
  describe('getMatrix', () => {
    it('returns empty matrix for a project with no requirements', async () => {
      const result = await svc.getMatrix(helper.projectId);
      expect(result.requirements).toHaveLength(0);
      expect(result.summary.total).toBe(0);
      expect(result.summary.overallCoveragePct).toBe(0);
    });

    it('returns requirements with NOT_COVERED when no test cases linked', async () => {
      await seedRequirement(pool, helper.projectId, 'HIGH');

      const result = await svc.getMatrix(helper.projectId);
      expect(result.requirements).toHaveLength(1);
      expect(result.requirements[0].coverageStatus).toBe('NOT_COVERED');
      expect(result.requirements[0].coveragePct).toBe(0);
      expect(result.requirements[0].testCaseCount).toBe(0);
    });

    it('returns COVERED for MEDIUM requirement with 1 linked test case', async () => {
      const reqId = await seedRequirement(pool, helper.projectId, 'MEDIUM');
      const tcId  = await seedTestCase(pool, helper.projectId, 'EQUIVALENCE');
      await svc.linkTestCases(reqId, helper.projectId, [tcId]);

      const result = await svc.getMatrix(helper.projectId);
      const req = result.requirements.find((r: any) => r.id === reqId);
      expect(req?.coverageStatus).toBe('COVERED');
      expect(req?.coveragePct).toBe(100);
      expect(req?.techniques).toContain('EQUIVALENCE');
    });

    it('returns PARTIAL for CRITICAL requirement with only 1 technique', async () => {
      const reqId = await seedRequirement(pool, helper.projectId, 'CRITICAL');
      const tcId  = await seedTestCase(pool, helper.projectId, 'EQUIVALENCE');
      await svc.linkTestCases(reqId, helper.projectId, [tcId]);

      const result = await svc.getMatrix(helper.projectId);
      const req = result.requirements.find((r: any) => r.id === reqId);
      expect(req?.coverageStatus).toBe('PARTIAL');
      expect(req?.coveragePct).toBeLessThan(100);
    });

    it('returns COVERED for HIGH requirement with 2 different techniques', async () => {
      const reqId = await seedRequirement(pool, helper.projectId, 'HIGH');
      const tc1   = await seedTestCase(pool, helper.projectId, 'EQUIVALENCE');
      const tc2   = await seedTestCase(pool, helper.projectId, 'BOUNDARY');
      await svc.linkTestCases(reqId, helper.projectId, [tc1, tc2]);

      const result = await svc.getMatrix(helper.projectId);
      const req = result.requirements.find((r: any) => r.id === reqId);
      expect(req?.coverageStatus).toBe('COVERED');
      expect(req?.coveragePct).toBe(100);
    });

    it('de-duplicates techniques (same technique twice = techniqueCount 1)', async () => {
      const reqId = await seedRequirement(pool, helper.projectId, 'HIGH');
      const tc1   = await seedTestCase(pool, helper.projectId, 'EQUIVALENCE');
      const tc2   = await seedTestCase(pool, helper.projectId, 'EQUIVALENCE');
      await svc.linkTestCases(reqId, helper.projectId, [tc1, tc2]);

      const result = await svc.getMatrix(helper.projectId);
      const req = result.requirements.find((r: any) => r.id === reqId);
      expect(req?.coverageStatus).toBe('PARTIAL');
      expect(req?.techniqueCount).toBe(1);
    });

    it('builds correct summary', async () => {
      const req1 = await seedRequirement(pool, helper.projectId, 'MEDIUM');
      await seedRequirement(pool, helper.projectId, 'HIGH');
      const tc1  = await seedTestCase(pool, helper.projectId, 'EQUIVALENCE');
      await svc.linkTestCases(req1, helper.projectId, [tc1]);

      const result = await svc.getMatrix(helper.projectId);
      expect(result.summary.total).toBe(2);
      expect(result.summary.covered).toBe(1);
      expect(result.summary.notCovered).toBe(1);
      expect(result.projectId).toBe(helper.projectId);
    });
  });

  // ── getRequirementRow ────────────────────────────────────────────────────
  describe('getRequirementRow', () => {
    it('returns row by UUID', async () => {
      const reqId = await seedRequirement(pool, helper.projectId, 'HIGH');
      const row = await svc.getRequirementRow(reqId, helper.projectId);
      expect(row.id).toBe(reqId);
      expect(row.priority).toBe('HIGH');
    });

    it('returns row by externalId', async () => {
      await seedRequirement(pool, helper.projectId, 'LOW', 'REQ-EXT-001');
      const row = await svc.getRequirementRow('REQ-EXT-001', helper.projectId);
      expect(row.externalId).toBe('REQ-EXT-001');
    });

    it('includes testCases array in the response', async () => {
      const reqId = await seedRequirement(pool, helper.projectId, 'MEDIUM');
      const tcId  = await seedTestCase(pool, helper.projectId);
      await svc.linkTestCases(reqId, helper.projectId, [tcId]);

      const row = await svc.getRequirementRow(reqId, helper.projectId);
      expect(Array.isArray(row.testCases)).toBe(true);
      expect(row.testCases?.length).toBe(1);
    });

    it('throws ApiError 404 when requirement not found', async () => {
      await expect(svc.getRequirementRow(uuid(), helper.projectId))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws ApiError 404 for wrong projectId', async () => {
      const reqId   = await seedRequirement(pool, helper.projectId);
      const otherId = uuid();
      await pool.query(
        `INSERT INTO projects(id,org_id,name,slug,created_by) VALUES($1,$2,$3,$4,$5)`,
        [otherId, helper.orgId, 'Other', 'other7', helper.userId],
      );
      await expect(svc.getRequirementRow(reqId, otherId))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── getCoverageAggregate ────────────────────────────────────────────────
  describe('getCoverageAggregate', () => {
    it('returns zeros for empty project', async () => {
      const agg = await svc.getCoverageAggregate(helper.projectId);
      expect(agg.totalRequirements).toBe(0);
      expect(agg.overallCoveragePct).toBe(0);
    });

    it('counts covered / partial / notCovered correctly', async () => {
      const req1 = await seedRequirement(pool, helper.projectId, 'MEDIUM');
      const req2 = await seedRequirement(pool, helper.projectId, 'HIGH');
      await seedRequirement(pool, helper.projectId, 'MEDIUM');

      const tc1 = await seedTestCase(pool, helper.projectId, 'EQUIVALENCE');
      const tc2 = await seedTestCase(pool, helper.projectId, 'BOUNDARY');
      await svc.linkTestCases(req1, helper.projectId, [tc1]);
      await svc.linkTestCases(req2, helper.projectId, [tc2]);

      const agg = await svc.getCoverageAggregate(helper.projectId);
      expect(agg.totalRequirements).toBe(3);
      expect(agg.covered).toBe(1);
      expect(agg.partial).toBe(1);
      expect(agg.notCovered).toBe(1);
    });

    it('caps overallCoveragePct at 100', async () => {
      const reqId = await seedRequirement(pool, helper.projectId, 'MEDIUM');
      const tc1 = await seedTestCase(pool, helper.projectId, 'EQUIVALENCE');
      const tc2 = await seedTestCase(pool, helper.projectId, 'BOUNDARY');
      const tc3 = await seedTestCase(pool, helper.projectId, 'DECISION');
      await svc.linkTestCases(reqId, helper.projectId, [tc1, tc2, tc3]);

      const agg = await svc.getCoverageAggregate(helper.projectId);
      expect(agg.overallCoveragePct).toBeLessThanOrEqual(100);
    });
  });

  // ── linkTestCases ────────────────────────────────────────────────────────
  describe('linkTestCases', () => {
    it('links multiple test cases to a requirement', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      const tc1   = await seedTestCase(pool, helper.projectId);
      const tc2   = await seedTestCase(pool, helper.projectId);

      const result = await svc.linkTestCases(reqId, helper.projectId, [tc1, tc2]);
      expect(result.count).toBe(2);
      expect(result.linked).toContain(tc1);
      expect(result.linked).toContain(tc2);
    });

    it('silently skips unknown test case IDs', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      const tc1   = await seedTestCase(pool, helper.projectId);

      const result = await svc.linkTestCases(reqId, helper.projectId, [tc1, uuid()]);
      expect(result.count).toBe(1);
      expect(result.linked).toContain(tc1);
    });

    it('handles duplicate links gracefully (ON CONFLICT DO NOTHING)', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      const tc1   = await seedTestCase(pool, helper.projectId);
      await svc.linkTestCases(reqId, helper.projectId, [tc1]);
      const result = await svc.linkTestCases(reqId, helper.projectId, [tc1]);
      expect(result).toBeDefined();
    });

    it('throws ApiError 400 on empty testCaseIds array', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      await expect(svc.linkTestCases(reqId, helper.projectId, []))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws ApiError 404 when requirement not found', async () => {
      const tc1 = await seedTestCase(pool, helper.projectId);
      await expect(svc.linkTestCases(uuid(), helper.projectId, [tc1]))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('links by externalId', async () => {
      await seedRequirement(pool, helper.projectId, 'MEDIUM', 'REQ-EXT-002');
      const tc1 = await seedTestCase(pool, helper.projectId);
      const result = await svc.linkTestCases('REQ-EXT-002', helper.projectId, [tc1]);
      expect(result.count).toBe(1);
    });
  });

  // ── linkDefect ──────────────────────────────────────────────────────────
  describe('linkDefect', () => {
    it('creates a defect link and returns alreadyLinked=false', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      const result = await svc.linkDefect(reqId, helper.projectId, 'BUG-1234', helper.userId);

      expect(result.defect_id).toBe('BUG-1234');
      expect(result.alreadyLinked).toBe(false);
    });

    it('returns alreadyLinked=true on conflict', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      await svc.linkDefect(reqId, helper.projectId, 'BUG-1234', helper.userId);
      const result = await svc.linkDefect(reqId, helper.projectId, 'BUG-1234', helper.userId);
      expect(result.alreadyLinked).toBe(true);
    });

    it('persists the link to traceability_defect_links', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      await svc.linkDefect(reqId, helper.projectId, 'BUG-9999', helper.userId);

      const rows = await pool.query(
        `SELECT * FROM traceability_defect_links WHERE defect_id = 'BUG-9999'`,
      );
      expect(rows.rows).toHaveLength(1);
    });

    it('throws ApiError 400 when defectId is empty', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      await expect(svc.linkDefect(reqId, helper.projectId, '   ', helper.userId))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws ApiError 404 when requirement not found', async () => {
      await expect(svc.linkDefect(uuid(), helper.projectId, 'BUG-0001', helper.userId))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('supports multiple distinct defects on same requirement', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      await svc.linkDefect(reqId, helper.projectId, 'BUG-001', helper.userId);
      await svc.linkDefect(reqId, helper.projectId, 'BUG-002', helper.userId);

      const rows = await pool.query(
        `SELECT * FROM traceability_defect_links WHERE requirement_id = $1`,
        [reqId],
      );
      expect(rows.rows).toHaveLength(2);
    });
  });

  // ── createLink (generic) ─────────────────────────────────────────────────
  describe('createLink', () => {
    it('creates a generic trace link', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      const tcId  = await seedTestCase(pool, helper.projectId);

      const result = await svc.createLink({
        projectId:   helper.projectId,
        sourceType:  'REQUIREMENT',
        sourceId:    reqId,
        targetType:  'TEST_CASE',
        targetId:    tcId,
        relationship: 'COVERS',
      });

      expect(result.id).toBeDefined();
      expect(result.relationship).toBe('COVERS');
    });

    it('returns undefined on duplicate (ON CONFLICT DO NOTHING)', async () => {
      const reqId = await seedRequirement(pool, helper.projectId);
      const tcId  = await seedTestCase(pool, helper.projectId);
      const params = {
        projectId: helper.projectId,
        sourceType: 'REQUIREMENT',
        sourceId: reqId,
        targetType: 'TEST_CASE',
        targetId: tcId,
        relationship: 'COVERS',
      };

      await svc.createLink(params);
      const result = await svc.createLink(params);
      expect(result).toBeUndefined();
    });
  });

  // ── Coverage formula (§ 4.4.L) ──────────────────────────────────────────
  describe('Coverage formula', () => {
    const TECHNIQUES = ['EQUIVALENCE', 'BOUNDARY', 'DECISION', 'STATE', 'PAIRWISE', 'EXPLORATORY'];
    const cases = [
      { priority: 'CRITICAL', given: 1, expectedPct: 33,  status: 'PARTIAL' },
      { priority: 'CRITICAL', given: 3, expectedPct: 100, status: 'COVERED' },
      { priority: 'HIGH',     given: 1, expectedPct: 50,  status: 'PARTIAL' },
      { priority: 'HIGH',     given: 2, expectedPct: 100, status: 'COVERED' },
      { priority: 'MEDIUM',   given: 1, expectedPct: 100, status: 'COVERED' },
      { priority: 'LOW',      given: 0, expectedPct: 0,   status: 'NOT_COVERED' },
    ] as const;

    cases.forEach(({ priority, given, expectedPct, status }) => {
      it(`${priority} req with ${given} distinct techniques → ${expectedPct}% (${status})`, async () => {
        const reqId = await seedRequirement(pool, helper.projectId, priority);
        const tcIds: string[] = [];
        for (let i = 0; i < given; i++) {
          tcIds.push(await seedTestCase(pool, helper.projectId, TECHNIQUES[i]));
        }
        if (tcIds.length) await svc.linkTestCases(reqId, helper.projectId, tcIds);

        const result = await svc.getMatrix(helper.projectId);
        const req = result.requirements.find((r: any) => r.id === reqId);
        expect(req?.coveragePct).toBe(expectedPct);
        expect(req?.coverageStatus).toBe(status);
      });
    });
  });
});
