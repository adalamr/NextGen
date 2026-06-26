import { Router, Request, Response, NextFunction } from 'express';
import { RiskPrioritizationService } from './risk-prioritization.service';
import { getPool } from '../../../config/database.config';

const router = Router();
const service = new RiskPrioritizationService();

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

// ── GET /risk-prioritization?projectId=&riskLevel= ─────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, riskLevel } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.listAssessments(projectId as string, { riskLevel: riskLevel as string });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /risk-prioritization/summary?projectId= ───────────────────────────
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getSummary(projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /risk-prioritization/:id ─────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getAssessment(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /risk-prioritization/assess ──────────────────────────────────────
// Body: { projectId, requirementId, requirementText }
router.post('/assess', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, requirementId, requirementText } = req.body;
    if (!projectId || !requirementId || !requirementText)
      throw { status: 400, message: 'projectId, requirementId and requirementText are required' };
    const llmConfig = await getProjectLlmConfig(projectId);
    if (!llmConfig) throw { status: 400, message: 'LLM config not set for this project' };
    const data = await service.assessRisk(projectId, requirementId, requirementText, llmConfig);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /risk-prioritization/batch-assess ──────────────────────────────
// Body: { projectId } — assesses all active requirements in the project
router.post('/batch-assess', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const llmConfig = await getProjectLlmConfig(projectId);
    if (!llmConfig) throw { status: 400, message: 'LLM config not set for this project' };
    const data = await service.batchAssess(projectId, llmConfig);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
