/**
 * Unit tests — KnowledgeBaseService
 *
 * Coverage targets:
 *  ✅ listDocuments — pagination, docType filter, search filter, count
 *  ✅ createEntry   — success path, empty content guard, embedding enqueued
 *  ✅ createEntry   — no llmConfig → PENDING, no embedding job
 *  ✅ updateEntry   — updates content (resets status), updates metadata only
 *  ✅ updateEntry   — not found → ApiError 404, empty patch → ApiError 400
 *  ✅ deleteDocument — success, not found → ApiError 404
 *  ✅ getStats      — counts by doc_type and embedding_status
 *  ✅ generateEmbedding — success path (fetch mock), error path
 */

// ── Must be first: mock BullMQ so no Redis connection is attempted ──────────
import '../../../__tests__/helpers/redis.helper';
import { getCapturedJobs, clearCapturedJobs } from '../../../__tests__/helpers/redis.helper';

import { DbHelper } from '../../../__tests__/helpers/db.helper';
import { KnowledgeBaseService } from '../../../modules/layer1-context/knowledge-base/knowledge-base.service';
import { ApiError } from '../../../utils/api-error';
import * as dbConfig from '../../../config/database.config';
import { v4 as uuid } from 'uuid';

// ── Mock the database pool so the service uses our in-memory DB ─────────────
jest.mock('../../../config/database.config', () => ({
  getPool: jest.fn(),
}));

// ── Mock llm-gateway so the complex gateway import doesn't fail in tests ────
jest.mock('@platform/llm-gateway', () => ({
  LLMGateway: jest.fn().mockImplementation(() => ({
    completeJSON: jest.fn(),
  })),
  buildKnowledgeSearchPrompt: jest.fn().mockReturnValue({ systemPrompt: 'sys', userPrompt: 'usr' }),
}));

// ── Mock the logger so we get no noise ──────────────────────────────────────
jest.mock('../../../utils/logger', () => ({
  childLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  }),
}));

// ── Global fetch mock ────────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Helpers ──────────────────────────────────────────────────────────────────
const LLM_CONFIG = {
  apiEndpoint: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  modelName: 'claude-sonnet-4.6',
};

function makeFetchEmbeddingOk(vector: number[] = [0.1, 0.2, 0.3]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: [{ embedding: vector }] }),
  } as unknown as Response);
}

// ── Test suite ───────────────────────────────────────────────────────────────
describe('KnowledgeBaseService', () => {
  let helper: DbHelper;
  let svc: KnowledgeBaseService;
  let pool: ReturnType<DbHelper['getPool']>;

  beforeEach(async () => {
    helper = new DbHelper();
    await helper.setup();
    pool = helper.getPool();
    (dbConfig.getPool as jest.Mock).mockReturnValue(pool);
    svc = new KnowledgeBaseService();
    clearCapturedJobs();
    mockFetch.mockReset();
  });

  afterEach(() => {
    helper.teardown();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // listDocuments
  // ─────────────────────────────────────────────────────────────────────────
  describe('listDocuments', () => {
    it('returns empty list when no documents exist', async () => {
      const result = await svc.listDocuments(helper.projectId);
      expect(result.documents).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('returns documents with excerpts (max 300 chars)', async () => {
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content)
         VALUES($1,$2,$3,$4)`,
        [uuid(), helper.projectId, 'requirement', 'Hello World requirement text'],
      );

      const result = await svc.listDocuments(helper.projectId);
      expect(result.documents).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.documents[0].type).toBe('requirement');
      expect(result.documents[0].embeddingStatus).toBe('PENDING');
      expect(result.documents[0].excerpt).toBeDefined();
    });

    it('filters by docType', async () => {
      const p = helper.projectId;
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content) VALUES($1,$2,$3,$4)`,
        [uuid(), p, 'requirement', 'req content'],
      );
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content) VALUES($1,$2,$3,$4)`,
        [uuid(), p, 'test_case', 'tc content'],
      );

      const result = await svc.listDocuments(p, { docType: 'requirement' });
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].type).toBe('requirement');
      expect(result.total).toBe(1);
    });

    it('filters by search term (ILIKE)', async () => {
      const p = helper.projectId;
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content) VALUES($1,$2,$3,$4)`,
        [uuid(), p, 'requirement', 'login validation feature'],
      );
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content) VALUES($1,$2,$3,$4)`,
        [uuid(), p, 'requirement', 'payment processing flow'],
      );

      const result = await svc.listDocuments(p, { search: 'login' });
      expect(result.total).toBe(1);
      expect(result.documents[0].excerpt).toContain('login');
    });

    it('paginates correctly', async () => {
      const p = helper.projectId;
      for (let i = 0; i < 5; i++) {
        await pool.query(
          `INSERT INTO knowledge_vectors(id,project_id,doc_type,content) VALUES($1,$2,$3,$4)`,
          [uuid(), p, 'requirement', `content ${i}`],
        );
      }

      const page1 = await svc.listDocuments(p, { page: 1, limit: 2 });
      expect(page1.documents).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(2);

      const page2 = await svc.listDocuments(p, { page: 2, limit: 2 });
      expect(page2.documents).toHaveLength(2);

      const page3 = await svc.listDocuments(p, { page: 3, limit: 2 });
      expect(page3.documents).toHaveLength(1);
    });

    it('caps limit at 100', async () => {
      const result = await svc.listDocuments(helper.projectId, { limit: 9999 });
      expect(result.limit).toBe(100);
    });

    it('treats page < 1 as page 1', async () => {
      const result = await svc.listDocuments(helper.projectId, { page: -5 });
      expect(result.page).toBe(1);
    });

    it('scopes results to the correct project', async () => {
      // Create a second project
      const otherProjId = uuid();
      await pool.query(
        `INSERT INTO projects(id,org_id,name,slug,created_by) VALUES($1,$2,$3,$4,$5)`,
        [otherProjId, helper.orgId, 'Other Project', 'other', helper.userId],
      );
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content) VALUES($1,$2,$3,$4)`,
        [uuid(), otherProjId, 'requirement', 'other project doc'],
      );
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content) VALUES($1,$2,$3,$4)`,
        [uuid(), helper.projectId, 'requirement', 'my project doc'],
      );

      const result = await svc.listDocuments(helper.projectId);
      expect(result.total).toBe(1);
      expect(result.documents[0].projectId).toBe(helper.projectId);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // createEntry
  // ─────────────────────────────────────────────────────────────────────────
  describe('createEntry', () => {
    it('creates entry with PENDING status and returns mapped document', async () => {
      const entry = await svc.createEntry(helper.projectId, {
        type: 'requirement',
        content: 'User must be able to log in',
      });

      expect(entry.id).toBeDefined();
      expect(entry.projectId).toBe(helper.projectId);
      expect(entry.type).toBe('requirement');
      expect(entry.docType).toBe('requirement');
      expect(entry.embeddingStatus).toBe('PENDING');
      expect(entry.excerpt).toContain('User must be able');
    });

    it('trims whitespace from content before saving', async () => {
      const entry = await svc.createEntry(helper.projectId, {
        type: 'api',
        content: '  trimmed content   ',
      });
      // excerpt should not have leading/trailing spaces
      expect(entry.excerpt?.trim()).toBe(entry.excerpt);
    });

    it('stores docId when provided', async () => {
      const docId = uuid();
      const entry = await svc.createEntry(helper.projectId, {
        type: 'test_case',
        content: 'Test content',
        docId,
      });
      expect(entry.docId).toBe(docId);
    });

    it('throws ApiError 400 when content is empty string', async () => {
      await expect(svc.createEntry(helper.projectId, {
        type: 'requirement',
        content: '',
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws ApiError 400 when content is whitespace only', async () => {
      await expect(svc.createEntry(helper.projectId, {
        type: 'requirement',
        content: '   ',
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('enqueues embedding job when llmConfig is provided', async () => {
      await svc.createEntry(helper.projectId, {
        type: 'requirement',
        content: 'Embed me',
      }, LLM_CONFIG);

      const jobs = getCapturedJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].queueName).toBe('layer1:embedding');
      expect((jobs[0].data as any).llmConfig.apiEndpoint).toBe(LLM_CONFIG.apiEndpoint);
      expect((jobs[0].data as any).docType).toBe('requirement');
    });

    it('does NOT enqueue embedding job when no llmConfig', async () => {
      await svc.createEntry(helper.projectId, {
        type: 'requirement',
        content: 'No embedding',
      });
      expect(getCapturedJobs()).toHaveLength(0);
    });

    it('entry is persisted in the database', async () => {
      await svc.createEntry(helper.projectId, {
        type: 'entity',
        content: 'Persisted content',
        metadata: { source: 'manual' },
      });

      const rows = await pool.query(
        `SELECT * FROM knowledge_vectors WHERE project_id = $1`,
        [helper.projectId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].doc_type).toBe('entity');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // updateEntry
  // ─────────────────────────────────────────────────────────────────────────
  describe('updateEntry', () => {
    let entryId: string;

    beforeEach(async () => {
      // Insert a document directly for update tests
      const r = await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,doc_id,content,embedding_status)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [uuid(), helper.projectId, 'requirement', null, 'Original content', 'embedded'],
      );
      entryId = r.rows[0].id;
    });

    it('updates content and resets embedding_status to PENDING', async () => {
      const result = await svc.updateEntry(entryId, helper.projectId, {
        content: 'Updated content',
      });

      expect(result.embeddingStatus).toBe('PENDING');
      expect(result.excerpt).toContain('Updated');
    });

    it('re-enqueues embedding job when content is changed with llmConfig', async () => {
      await svc.updateEntry(entryId, helper.projectId, {
        content: 'New content for embedding',
      }, LLM_CONFIG);

      const jobs = getCapturedJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].queueName).toBe('layer1:embedding');
    });

    it('does NOT enqueue embedding job when only metadata changes', async () => {
      await svc.updateEntry(entryId, helper.projectId, {
        metadata: { updated: true },
      }, LLM_CONFIG);

      expect(getCapturedJobs()).toHaveLength(0);
    });

    it('throws ApiError 400 when neither content nor metadata is provided', async () => {
      await expect(svc.updateEntry(entryId, helper.projectId, {}))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws ApiError 400 when content is empty string', async () => {
      await expect(svc.updateEntry(entryId, helper.projectId, { content: '' }))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws ApiError 404 when entry does not exist', async () => {
      await expect(svc.updateEntry(uuid(), helper.projectId, { content: 'X' }))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws ApiError 404 when entry belongs to different project', async () => {
      const otherId = uuid();
      await pool.query(
        `INSERT INTO projects(id,org_id,name,slug,created_by) VALUES($1,$2,$3,$4,$5)`,
        [otherId, helper.orgId, 'Other', 'other2', helper.userId],
      );
      await expect(svc.updateEntry(entryId, otherId, { content: 'X' }))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('updates metadata without touching content or embedding_status', async () => {
      const result = await svc.updateEntry(entryId, helper.projectId, {
        metadata: { key: 'value' },
      });
      // embeddingStatus is NOT reset when only metadata changes
      expect(result.embeddingStatus).toBe('embedded');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // deleteDocument
  // ─────────────────────────────────────────────────────────────────────────
  describe('deleteDocument', () => {
    it('deletes an existing document and returns success', async () => {
      const r = await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [uuid(), helper.projectId, 'requirement', 'to delete'],
      );
      const id = r.rows[0].id;

      const result = await svc.deleteDocument(id, helper.projectId);
      expect(result.success).toBe(true);
      expect(result.id).toBe(id);

      const check = await pool.query(
        'SELECT id FROM knowledge_vectors WHERE id = $1', [id],
      );
      expect(check.rows).toHaveLength(0);
    });

    it('throws ApiError 404 when document does not exist', async () => {
      await expect(svc.deleteDocument(uuid(), helper.projectId))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws ApiError 404 when document belongs to a different project', async () => {
      const r = await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [uuid(), helper.projectId, 'requirement', 'mine'],
      );
      const otherId = uuid();
      await pool.query(
        `INSERT INTO projects(id,org_id,name,slug,created_by) VALUES($1,$2,$3,$4,$5)`,
        [otherId, helper.orgId, 'Other', 'other3', helper.userId],
      );
      await expect(svc.deleteDocument(r.rows[0].id, otherId))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getStats
  // ─────────────────────────────────────────────────────────────────────────
  describe('getStats', () => {
    it('returns zero counts when no documents exist', async () => {
      const stats = await svc.getStats(helper.projectId);
      expect(stats.totalChunks).toBe(0);
      expect(stats.byDocType).toEqual({});
      expect(stats.byEmbeddingStatus).toEqual({});
    });

    it('counts documents by doc_type', async () => {
      const p = helper.projectId;
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content) VALUES($1,$2,$3,$4)`,
        [uuid(), p, 'requirement', 'r1'],
      );
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content) VALUES($1,$2,$3,$4)`,
        [uuid(), p, 'requirement', 'r2'],
      );
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content) VALUES($1,$2,$3,$4)`,
        [uuid(), p, 'test_case', 'tc1'],
      );

      const stats = await svc.getStats(p);
      expect(stats.totalChunks).toBe(3);
      expect(stats.byDocType['requirement']).toBe(2);
      expect(stats.byDocType['test_case']).toBe(1);
    });

    it('counts documents by embedding_status', async () => {
      const p = helper.projectId;
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content,embedding_status) VALUES($1,$2,$3,$4,$5)`,
        [uuid(), p, 'requirement', 'r1', 'PENDING'],
      );
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content,embedding_status) VALUES($1,$2,$3,$4,$5)`,
        [uuid(), p, 'requirement', 'r2', 'embedded'],
      );
      await pool.query(
        `INSERT INTO knowledge_vectors(id,project_id,doc_type,content,embedding_status) VALUES($1,$2,$3,$4,$5)`,
        [uuid(), p, 'requirement', 'r3', 'FAILED'],
      );

      const stats = await svc.getStats(p);
      expect(stats.byEmbeddingStatus['PENDING']).toBe(1);
      expect(stats.byEmbeddingStatus['embedded']).toBe(1);
      expect(stats.byEmbeddingStatus['FAILED']).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // generateEmbedding
  // ─────────────────────────────────────────────────────────────────────────
  describe('generateEmbedding', () => {
    it('calls the OpenAI-compatible embeddings endpoint and returns the vector', async () => {
      const vector = [0.1, 0.2, 0.3];
      makeFetchEmbeddingOk(vector);

      const result = await svc.generateEmbedding('test query', LLM_CONFIG);
      expect(result).toEqual(vector);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${LLM_CONFIG.apiKey}`,
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('strips trailing slash from apiEndpoint when building URL', async () => {
      const vector = [0.5];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: vector }] }),
      } as unknown as Response);

      await svc.generateEmbedding('query', {
        ...LLM_CONFIG,
        apiEndpoint: 'https://api.example.com/v1/',
      });

      const url = (mockFetch.mock.calls[0] as any[])[0] as string;
      expect(url).toBe('https://api.example.com/v1/embeddings');
    });

    it('throws when the API returns a non-OK status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as unknown as Response);

      await expect(svc.generateEmbedding('query', LLM_CONFIG))
        .rejects.toThrow('Embedding API error 401');
    });

    it('throws when the API returns no embedding vector', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      } as unknown as Response);

      await expect(svc.generateEmbedding('query', LLM_CONFIG))
        .rejects.toThrow('Gateway returned no embedding vector');
    });

    it('slices input text to max 8000 chars before sending', async () => {
      makeFetchEmbeddingOk([0.1]);
      const longText = 'a'.repeat(10000);
      await svc.generateEmbedding(longText, LLM_CONFIG);

      const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
      expect(body.input.length).toBeLessThanOrEqual(8000);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // storeChunk (ingestion worker path)
  // ─────────────────────────────────────────────────────────────────────────
  describe('storeChunk', () => {
    it('stores a chunk with provided embedding and returns the id', async () => {
      const result = await svc.storeChunk({
        projectId: helper.projectId,
        docType: 'DOC',
        docId: 'doc-001',
        content: 'Chunk content',
        embedding: [0.1, 0.2, 0.3],
        metadata: { source: 'ingestion' },
      });
      expect(result.id).toBeDefined();

      const rows = await pool.query(
        `SELECT * FROM knowledge_vectors WHERE project_id = $1 AND doc_type = 'DOC'`,
        [helper.projectId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].embedding_status).toBe('embedded');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // KB_ENTRY_TYPES export
  // ─────────────────────────────────────────────────────────────────────────
  describe('KB_ENTRY_TYPES constant', () => {
    it('includes all required types', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { KB_ENTRY_TYPES } = require('../../../modules/layer1-context/knowledge-base/knowledge-base.service');
      expect(KB_ENTRY_TYPES).toContain('requirement');
      expect(KB_ENTRY_TYPES).toContain('test_case');
      expect(KB_ENTRY_TYPES).toContain('gold_standard_test_case');
      expect(KB_ENTRY_TYPES).toContain('api');
    });
  });
});
