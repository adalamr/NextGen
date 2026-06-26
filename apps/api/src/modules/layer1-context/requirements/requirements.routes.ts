import { Router, Request, Response, NextFunction } from 'express';
import { RequirementsService } from './requirements.service';
import { getPool } from '../../../config/database.config';

/**
 * Requirements router — mounted at /api/v1/projects
 * All routes are nested under /:projectId/requirements
 *
 * :reqId accepts either a UUID or a human-readable external_id
 * (e.g. REQ-IVA-001).  The service resolves both transparently.
 */
const router = Router({ mergeParams: true });
const service = new RequirementsService();

// Fetches LLM config for the project so the service can enqueue embeddings.
// Returns undefined when the project has no LLM config configured yet.
async function resolveLlmConfig(
  projectId: string,
): Promise<{ apiEndpoint: string; apiKey: string; modelName: string } | undefined> {
  try {
    const pool = getPool();
    const r = await pool.query(
      'SELECT llm_endpoint, llm_api_key_encrypted, llm_model FROM projects WHERE id = $1',
      [projectId],
    );
    const row = r.rows[0];
    if (!row || !row.llm_endpoint) return undefined;
    return {
      apiEndpoint: row.llm_endpoint           as string,
      apiKey:      row.llm_api_key_encrypted   as string,
      modelName:   row.llm_model               as string,
    };
  } catch {
    return undefined;
  }
}

// ── GET /projects/:projectId/requirements ───────────────────────────────
router.get(
  '/:projectId/requirements',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const { page, limit, status, priority, search } = req.query;
      const data = await service.getRequirements(projectId, {
        page:     page     ? parseInt(page     as string, 10) : 1,
        limit:    limit    ? parseInt(limit    as string, 10) : 20,
        status:   status   as string,
        priority: priority as string,
        search:   search   as string,
      });
      res.json({ success: true, ...data });
    } catch (err) { next(err); }
  },
);

// ── GET /projects/:projectId/requirements/stats ─────────────────────────
router.get(
  '/:projectId/requirements/stats',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await service.getStats(req.params.projectId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
);

// ── POST /projects/:projectId/requirements/bulk-import ──────────────────
// Must be registered BEFORE /:reqId to avoid param collision
router.post(
  '/:projectId/requirements/bulk-import',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const { requirements } = req.body;
      if (!Array.isArray(requirements)) {
        throw { status: 400, message: 'requirements must be an array' };
      }
      const llmConfig = await resolveLlmConfig(projectId);
      const data = await service.bulkImport(projectId, requirements, llmConfig);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  },
);

// ── GET /projects/:projectId/requirements/:reqId ────────────────────────
router.get(
  '/:projectId/requirements/:reqId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, reqId } = req.params;
      const data = await service.getRequirement(reqId, projectId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
);

// ── POST /projects/:projectId/requirements ──────────────────────────────
router.post(
  '/:projectId/requirements',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const dto = req.body;
      if (!dto.title) throw { status: 400, message: 'title is required' };
      const llmConfig = await resolveLlmConfig(projectId);
      const data = await service.createRequirement(projectId, dto, llmConfig);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  },
);

// ── PATCH /projects/:projectId/requirements/:reqId ──────────────────────
router.patch(
  '/:projectId/requirements/:reqId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, reqId } = req.params;
      const data = await service.updateRequirement(reqId, projectId, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
);

// ── DELETE /projects/:projectId/requirements/:reqId ─────────────────────
router.delete(
  '/:projectId/requirements/:reqId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, reqId } = req.params;
      const data = await service.deleteRequirement(reqId, projectId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
);

export default router;
