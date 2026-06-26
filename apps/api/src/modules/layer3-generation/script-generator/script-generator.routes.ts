import { Router, Request, Response, NextFunction } from 'express';
import { ScriptGeneratorService, SUPPORTED_FRAMEWORKS } from './script-generator.service';
import { getPool } from '../../../config/database.config';

const router = Router();
const service = new ScriptGeneratorService();

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

// ── GET /script-generator?projectId=&testCaseId=&framework=&page=&limit= ────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, testCaseId, framework, page, limit } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.listScripts(projectId as string, {
      testCaseId: testCaseId as string,
      framework:  framework  as string,
      page:  page  ? parseInt(page  as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

// ── GET /script-generator/:id?projectId= ─────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getScript(req.params.id, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /script-generator/generate ───────────────────────────────────────
// Body: { projectId, testCaseId, framework, language? }
// Synchronous generation — blocks until the script is returned.
router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, testCaseId, framework, language } = req.body;
    if (!projectId || !testCaseId || !framework)
      throw { status: 400, message: 'projectId, testCaseId and framework are required' };
    if (!(SUPPORTED_FRAMEWORKS as readonly string[]).includes(framework))
      throw { status: 400, message: `Invalid framework. Allowed: ${SUPPORTED_FRAMEWORKS.join(', ')}` };
    const llmConfig = await getProjectLlmConfig(projectId);
    if (!llmConfig) throw { status: 400, message: 'LLM config not set for this project' };
    const data = await service.generateScript(projectId, { testCaseId, framework, language }, llmConfig);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
