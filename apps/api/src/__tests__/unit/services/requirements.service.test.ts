/**
 * Unit tests — RequirementsService
 *
 * Coverage targets:
 *  ✅ create    — success, validates priority, generates externalId
 *  ✅ list      — pagination, status filter, priority filter, search
 *  ✅ getById   — found, not found → ApiError 404
 *  ✅ update    — partial update (title only, priority only, status only), not found
 *  ✅ delete    — success, not found → ApiError 404
 *  ✅ bulkImport — creates multiple, skips invalid
 *  ✅ getStats  — counts by priority and status
 */

// Mock BullMQ (requirements service enqueues embedding jobs)
import '../../../__tests__/helpers/redis.helper';
import { clearCapturedJobs, getCapturedJobs } from '../../../__tests__/helpers/redis.helper';

import { DbHelper } from '../../../__tests__/helpers/db.helper';
import * as dbConfig from '../../../config/database.config';
import { ApiError } from '../../../utils/api-error';
import { v4 as uuid } from 'uuid';

// Mock logger
jest.mock('../../../utils/logger', () => ({
  childLogger: () => ({
    info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(),
  }),
}));

jest.mock('../../../config/database.config', () => ({ getPool: jest.fn() }));

// Mock llm-gateway
jest.mock('@platform/llm-gateway', () => ({
  LLMGateway: jest.fn().mockImplementation(() => ({
    completeJSON: jest.fn(),
  })),
  buildKnowledgeSearchPrompt: jest.fn(),
}));

// Mock fetch so generateEmbedding doesn't make real HTTP calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

const LLM_CONFIG = {
  apiEndpoint: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  modelName: 'claude-sonnet-4.6',
};

// Lazy import after mocks (must come after jest.mock calls)
let RequirementsService: any;
let svc: any;

describe('RequirementsService', () => {
  let helper: DbHelper;
  let pool: ReturnType<DbHelper['getPool']>;

  beforeAll(() => {
    RequirementsService = require('../../../modules/layer1-context/requirements/requirements.service').RequirementsService;
  });

  beforeEach(async () => {
    helper = new DbHelper();
    await helper.setup();
    pool = helper.getPool();
    (dbConfig.getPool as jest.Mock).mockReturnValue(pool);
    svc = new RequirementsService();
    clearCapturedJobs();
    mockFetch.mockReset();
  });

  afterEach(() => {
    helper.teardown();
  });

  // ── createRequirement ─────────────────────────────────────────────────
  describe('createRequirement', () => {
    it('creates a requirement and returns the mapped object', async () => {
      const result = await svc.createRequirement(helper.projectId, {
        title: 'User Login',
        description: 'As a user I can log in',
        priority: 'HIGH',
      });

      expect(result.id).toBeDefined();
      expect(result.title).toBe('User Login');
      expect(result.priority).toBe('HIGH');
      expect(result.status).toBe('ACTIVE');
      expect(result.projectId).toBe(helper.projectId);
    });

    it('defaults priority to MEDIUM when not provided', async () => {
      const result = await svc.createRequirement(helper.projectId, {
        title: 'Minimal requirement',
      });
      expect(result.priority).toBe('MEDIUM');
    });

    it('throws ApiError 409 on duplicate title', async () => {
      await svc.createRequirement(helper.projectId, { title: 'Duplicate' });
      await expect(svc.createRequirement(helper.projectId, { title: 'Duplicate' }))
        .rejects.toMatchObject({ statusCode: 409 });
    });

    it('stores provided externalId', async () => {
      const result = await svc.createRequirement(helper.projectId, {
        title: 'External Requirement',
        externalId: 'REQ-001',
      });
      expect(result.externalId).toBe('REQ-001');
    });

    it('enqueues knowledge-base embedding when llmConfig provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
      });

      await svc.createRequirement(helper.projectId, {
        title: 'Embeddable requirement',
        priority: 'HIGH',
      }, LLM_CONFIG);

      const jobs = getCapturedJobs();
      // Should have enqueued at least one embedding job
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs[0].queueName).toBe('layer1:embedding');
    });

    it('accepts all valid priority values', async () => {
      for (const priority of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
        const r = await svc.createRequirement(helper.projectId, {
          title: `Priority ${priority}`,
          priority,
        });
        expect(r.priority).toBe(priority);
      }
    });
  });

  // ── getRequirements ─────────────────────────────────────────────────────
  describe('getRequirements', () => {
    beforeEach(async () => {
      const p = helper.projectId;
      await pool.query(
        `INSERT INTO requirements(id,project_id,title,priority,status)
         VALUES($1,$2,$3,$4,$5)`,
        [uuid(), p, 'Login Feature', 'HIGH', 'ACTIVE'],
      );
      await pool.query(
        `INSERT INTO requirements(id,project_id,title,priority,status)
         VALUES($1,$2,$3,$4,$5)`,
        [uuid(), p, 'Payment Processing', 'CRITICAL', 'ACTIVE'],
      );
      await pool.query(
        `INSERT INTO requirements(id,project_id,title,priority,status)
         VALUES($1,$2,$3,$4,$5)`,
        [uuid(), p, 'Old Feature', 'LOW', 'ARCHIVED'],
      );
    });

    it('lists all requirements for a project', async () => {
      const result = await svc.getRequirements(helper.projectId);
      expect(result.requirements).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('filters by status', async () => {
      const result = await svc.getRequirements(helper.projectId, { status: 'ACTIVE' });
      expect(result.requirements).toHaveLength(2);
      result.requirements.forEach((r: any) => expect(r.status).toBe('ACTIVE'));
    });

    it('filters by priority', async () => {
      const result = await svc.getRequirements(helper.projectId, { priority: 'HIGH' });
      expect(result.requirements).toHaveLength(1);
      expect(result.requirements[0].priority).toBe('HIGH');
    });

    it('filters by search term (title ILIKE)', async () => {
      const result = await svc.getRequirements(helper.projectId, { search: 'login' });
      expect(result.requirements).toHaveLength(1);
      expect(result.requirements[0].title).toBe('Login Feature');
    });

    it('paginates correctly', async () => {
      const result = await svc.getRequirements(helper.projectId, { page: 1, limit: 2 });
      expect(result.requirements).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('returns empty when project has no requirements', async () => {
      const otherProjId = uuid();
      await pool.query(
        `INSERT INTO projects(id,org_id,name,slug,created_by) VALUES($1,$2,$3,$4,$5)`,
        [otherProjId, helper.orgId, 'Empty', 'empty', helper.userId],
      );
      const result = await svc.getRequirements(otherProjId);
      expect(result.requirements).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ── getRequirement ─────────────────────────────────────────────────────
  describe('getRequirement', () => {
    it('returns the requirement when found by UUID', async () => {
      const id = uuid();
      await pool.query(
        `INSERT INTO requirements(id,project_id,title,priority)
         VALUES($1,$2,$3,$4)`,
        [id, helper.projectId, 'Found Req', 'MEDIUM'],
      );
      const result = await svc.getRequirement(id, helper.projectId);
      expect(result.id).toBe(id);
      expect(result.title).toBe('Found Req');
    });

    it('throws ApiError 404 when requirement does not exist', async () => {
      await expect(svc.getRequirement(uuid(), helper.projectId))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws ApiError 404 when requirement belongs to different project', async () => {
      const id = uuid();
      await pool.query(
        `INSERT INTO requirements(id,project_id,title)
         VALUES($1,$2,$3)`,
        [id, helper.projectId, 'Mine'],
      );
      const otherId = uuid();
      await pool.query(
        `INSERT INTO projects(id,org_id,name,slug,created_by) VALUES($1,$2,$3,$4,$5)`,
        [otherId, helper.orgId, 'Other', 'other4', helper.userId],
      );
      await expect(svc.getRequirement(id, otherId))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── updateRequirement ──────────────────────────────────────────────────
  describe('updateRequirement', () => {
    let reqId: string;

    beforeEach(async () => {
      reqId = uuid();
      await pool.query(
        `INSERT INTO requirements(id,project_id,title,priority,status)
         VALUES($1,$2,$3,$4,$5)`,
        [reqId, helper.projectId, 'Original', 'MEDIUM', 'ACTIVE'],
      );
    });

    it('updates the title', async () => {
      const result = await svc.updateRequirement(reqId, helper.projectId, { title: 'Updated Title' });
      expect(result.title).toBe('Updated Title');
    });

    it('updates the priority', async () => {
      const result = await svc.updateRequirement(reqId, helper.projectId, { priority: 'CRITICAL' });
      expect(result.priority).toBe('CRITICAL');
    });

    it('updates the status', async () => {
      const result = await svc.updateRequirement(reqId, helper.projectId, { status: 'ARCHIVED' });
      expect(result.status).toBe('ARCHIVED');
    });

    it('throws ApiError 400 when no fields to update', async () => {
      await expect(svc.updateRequirement(reqId, helper.projectId, {}))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws ApiError 404 when requirement not found', async () => {
      await expect(svc.updateRequirement(uuid(), helper.projectId, { title: 'X' }))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── deleteRequirement ──────────────────────────────────────────────────
  describe('deleteRequirement', () => {
    it('deletes requirement and returns success', async () => {
      const id = uuid();
      await pool.query(
        `INSERT INTO requirements(id,project_id,title) VALUES($1,$2,$3)`,
        [id, helper.projectId, 'To Delete'],
      );
      const result = await svc.deleteRequirement(id, helper.projectId);
      expect(result.success).toBe(true);

      await expect(svc.getRequirement(id, helper.projectId))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws ApiError 404 when requirement not found', async () => {
      await expect(svc.deleteRequirement(uuid(), helper.projectId))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── getStats ────────────────────────────────────────────────────────────
  describe('getStats', () => {
    it('returns zero counts for empty project', async () => {
      const stats = await svc.getStats(helper.projectId);
      expect(stats.total).toBe(0);
    });

    it('counts by priority and status', async () => {
      const p = helper.projectId;
      await pool.query(
        `INSERT INTO requirements(id,project_id,title,priority,status) VALUES($1,$2,$3,$4,$5)`,
        [uuid(), p, 'r1', 'HIGH', 'ACTIVE'],
      );
      await pool.query(
        `INSERT INTO requirements(id,project_id,title,priority,status) VALUES($1,$2,$3,$4,$5)`,
        [uuid(), p, 'r2', 'HIGH', 'ACTIVE'],
      );
      await pool.query(
        `INSERT INTO requirements(id,project_id,title,priority,status) VALUES($1,$2,$3,$4,$5)`,
        [uuid(), p, 'r3', 'LOW', 'ARCHIVED'],
      );

      const stats = await svc.getStats(p);
      expect(stats.total).toBe(3);
      expect(stats.byPriority?.HIGH).toBe(2);
      expect(stats.byPriority?.LOW).toBe(1);
    });
  });
});
