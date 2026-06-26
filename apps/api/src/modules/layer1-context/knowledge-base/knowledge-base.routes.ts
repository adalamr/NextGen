import { Router, Request, Response, NextFunction } from 'express';
import { KnowledgeBaseService, KB_ENTRY_TYPES } from './knowledge-base.service';
import { getPool } from '../../../config/database.config';

const router = Router();
const service = new KnowledgeBaseService();

// ── helpers ─────────────────────────────────────────────────────────────────

/** Fetch LLM config for a project. Returns null when not configured. */
async function getProjectLlmConfig(projectId: string) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT llm_endpoint, llm_api_key_encrypted, llm_model FROM projects WHERE id = $1',
    [projectId],
  );
  if (!result.rows.length) throw { status: 404, message: 'Project not found' };
  const p = result.rows[0];
  if (!p.llm_endpoint || !p.llm_api_key_encrypted) return null;
  return {
    apiEndpoint: p.llm_endpoint as string,
    apiKey: p.llm_api_key_encrypted as string,
    modelName: p.llm_model as string,
  };
}

// ── GET /knowledge-base?projectId=&docType=&search=&page=&limit= ────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, docType, search, page, limit } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.listDocuments(projectId as string, {
      docType: docType as string,
      search: search as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

// ── GET /knowledge-base/gold-standard?projectId= ───────────────────────────
// Lists test cases with gold_standard_candidate=TRUE awaiting approval.
// Registered BEFORE /:id to avoid param collision.
router.get('/gold-standard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.listGoldStandardCandidates(projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /knowledge-base/stats?projectId= ────────────────────────────────────
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getStats(projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /knowledge-base ─────────────────────────────────────────────────────
// Body: { projectId, type, content, docId?, metadata? }
// `type` must be one of: requirement | test_case | api | page | entity | business_rule
// The project's LLM config is used to enqueue an embedding job immediately;
// if the project has no LLM config the entry is still saved (status stays PENDING).
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, type, content, docId, metadata } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    if (!type)      throw { status: 400, message: 'type is required' };
    if (!content)   throw { status: 400, message: 'content is required' };

    if (!(KB_ENTRY_TYPES as readonly string[]).includes(type)) {
      throw {
        status: 400,
        message: `Invalid type "${type}". Allowed values: ${KB_ENTRY_TYPES.filter(t => t === t.toLowerCase()).join(', ')}`,
      };
    }

    const llmConfig = await getProjectLlmConfig(projectId);
    const data = await service.createEntry(
      projectId,
      { type, content, docId, metadata },
      llmConfig ?? undefined,
    );
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── PUT /knowledge-base/:id ──────────────────────────────────────────────────
// Body: { projectId, content?, metadata? }
// Re-enqueues an embedding job when content changes.
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, content, metadata } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };

    const llmConfig = await getProjectLlmConfig(projectId);
    const data = await service.updateEntry(
      req.params.id,
      projectId,
      { content, metadata },
      llmConfig ?? undefined,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /knowledge-base/reembed-pending?projectId= ──────────────────────────
// Admin utility: re-enqueues embedding jobs for every row with
// embedding_status = 'PENDING'. Used after bulk SQL seed to kick off
// vectorisation without having to re-insert each entry via the API.
router.post('/reembed-pending', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = (req.query.projectId || req.body.projectId) as string;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const llmConfig = await getProjectLlmConfig(projectId);
    if (!llmConfig) throw { status: 400, message: 'LLM config not set for this project. Configure endpoint and API key in Project Settings first.' };
    const data = await service.reembedPending(projectId, llmConfig);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /knowledge-base/search ──────────────────────────────────────────────// Body: { projectId, query, topK?, docType?, skipRerank? }
//
// skipRerank=true  → fast path: returns raw vector results without a second
//                    Bedrock call. Recommended when < 1 s latency is required
//                    or when no LLM config is available.
// skipRerank=false → full path: LLM re-ranks and synthesises an answer.
//
// When the project has no LLM config, skipRerank is forced to true so the
// endpoint always returns results instead of a 400 error.
router.post('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, query, topK, docType, skipRerank } = req.body;
    if (!projectId || !query) throw { status: 400, message: 'projectId and query are required' };

    const llmConfig = await getProjectLlmConfig(projectId);

    // Force fast path when no LLM config is configured
    const effectiveSkipRerank = skipRerank === true || llmConfig === null;

    // If no LLM config and caller explicitly wants re-rank, explain why it cannot work
    if (llmConfig === null && skipRerank === false) {
      throw {
        status: 400,
        message: 'LLM config not set for this project — re-rank requires Bedrock credentials. Either configure LLM in Project Settings or omit skipRerank (defaults to fast vector-only search).',
      };
    }

    const data = await service.search(
      projectId,
      query,
      llmConfig,
      { topK, docType, skipRerank: effectiveSkipRerank },
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── DELETE /knowledge-base/:id?projectId= ───────────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.deleteDocument(req.params.id, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /knowledge-base/gold-standard/:testCaseId/approve ─────────────────
// Human reviewer promotes a candidate to full Gold Standard and pushes
// the test case into knowledge_vectors for future few-shot retrieval.
// Body: { projectId }
router.post('/gold-standard/:testCaseId/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { testCaseId } = req.params;
    const { projectId } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };

    const reviewerId = (req as any).user?.userId;
    if (!reviewerId) throw { status: 401, message: 'Unauthorised' };

    const llmConfig = await getProjectLlmConfig(projectId);
    const data = await service.approveGoldStandard(
      testCaseId,
      projectId,
      reviewerId,
      llmConfig ?? undefined,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /knowledge-base/gold-standard/:testCaseId/revoke ────────────────────
// Revokes Gold Standard status and removes the vector entry.
// Body: { projectId }
router.post('/gold-standard/:testCaseId/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { testCaseId } = req.params;
    const { projectId } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.revokeGoldStandard(testCaseId, projectId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
