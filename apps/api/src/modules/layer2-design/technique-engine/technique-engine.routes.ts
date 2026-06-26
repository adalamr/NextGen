import { Router, Request, Response, NextFunction } from 'express';
import { TechniqueEngineService } from './technique-engine.service';
import { getPool } from '../../../config/database.config';

const router = Router();
const service = new TechniqueEngineService();

/** Fetch project LLM config — null when unconfigured. */
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

// ── GET /technique-engine?category=&search= ──────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, search } = req.query;
    const data = await service.listTechniques({
      category: category as string,
      search: search as string,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /technique-engine/:id ────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getTechnique(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /technique-engine/recommend ────────────────────────────────────────
// Body: { projectId, requirementText, topK? }
router.post('/recommend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, requirementText, topK } = req.body;
    if (!projectId || !requirementText)
      throw { status: 400, message: 'projectId and requirementText are required' };
    const llmConfig = await getProjectLlmConfig(projectId);
    const data = await service.recommendTechniques(
      projectId,
      requirementText,
      llmConfig ?? undefined,
      topK,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /technique-engine/analyse ──────────────────────────────────────────
// Body: { projectId, requirementText }
router.post('/analyse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, requirementText } = req.body;
    if (!projectId || !requirementText)
      throw { status: 400, message: 'projectId and requirementText are required' };
    const llmConfig = await getProjectLlmConfig(projectId);
    if (!llmConfig)
      throw { status: 400, message: 'LLM config not set for this project' };
    const data = await service.analyseRequirement(projectId, requirementText, llmConfig);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
