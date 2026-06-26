import { Router, Request, Response, NextFunction } from 'express';
import { CoverageGapService } from './coverage-gap.service';
import { getPool } from '../../../config/database.config';

const router = Router();
const service = new CoverageGapService();

async function getProjectLlmConfig(projectId: string) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT llm_endpoint, llm_api_key_encrypted, llm_model FROM projects WHERE id = $1',
    [projectId],
  );
  if (!result.rows.length) throw { status: 404, message: 'Project not found' };
  const p = result.rows[0];
  if (!p.llm_endpoint || !p.llm_api_key_encrypted) return null;
  return { apiEndpoint: p.llm_endpoint as string, apiKey: p.llm_api_key_encrypted as string, modelName: p.llm_model as string };
}

// ── GET /coverage-gap?projectId= ───────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.listGaps(projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /coverage-gap/suggest ───────────────────────────────────────────────
// Body: { projectId, maxGaps? }
router.post('/suggest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, maxGaps } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const llmConfig = await getProjectLlmConfig(projectId);
    if (!llmConfig) throw { status: 400, message: 'LLM config not set for this project' };
    const data = await service.suggestForGaps(projectId, llmConfig, maxGaps);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;