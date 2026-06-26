import { Router, Request, Response, NextFunction } from 'express';
import { TestDataGeneratorService } from './test-data-generator.service';
import { getPool } from '../../../config/database.config';

const router = Router();
const service = new TestDataGeneratorService();

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

// ── GET /test-data-generator?projectId=&testCaseId=&dataType= ─────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, testCaseId, dataType } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.listDataSets(projectId as string, {
      testCaseId: testCaseId as string,
      dataType:   dataType   as string,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /test-data-generator/:id?projectId= ──────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getDataSet(req.params.id, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /test-data-generator/generate ───────────────────────────────────
// Body: { projectId, testCaseId, dataTypes?, fieldSchema?, count? }
router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, testCaseId, dataTypes, fieldSchema, count } = req.body;
    if (!projectId || !testCaseId)
      throw { status: 400, message: 'projectId and testCaseId are required' };
    const llmConfig = await getProjectLlmConfig(projectId);
    if (!llmConfig) throw { status: 400, message: 'LLM config not set for this project' };
    const data = await service.generateData(projectId, { testCaseId, dataTypes, fieldSchema, count }, llmConfig);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── DELETE /test-data-generator/:id?projectId= ────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.deleteDataSet(req.params.id, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
