import { Router, Request, Response, NextFunction } from 'express';
import { CicdService } from './cicd.service';
import { RunnerService } from '../runner/runner.service';
import { getPool } from '../../../config/database.config';

const router = Router();
const cicdService   = new CicdService();
const runnerService = new RunnerService();

// ── GET /cicd?projectId= ─────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await cicdService.listIntegrations(projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /cicd/:id?projectId= ──────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await cicdService.getIntegration(req.params.id, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /cicd ─────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, ...dto } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await cicdService.createIntegration(projectId, dto);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── PATCH /cicd/:id ───────────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, ...dto } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await cicdService.updateIntegration(req.params.id, projectId, dto);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /cicd/:id/webhook ───────────────────────────────────────────────
// Called by CI pipelines.  Validates the secret and queues a test run.
router.post('/:id/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const meta = await cicdService.handleWebhookTrigger(req.params.id, req.body);

    // Find a QA environment for the project (fallback to first active)
    const pool = getPool();
    const envResult = await pool.query(
      `SELECT id FROM environments WHERE project_id = $1 AND is_active = TRUE AND type = 'QA'
       LIMIT 1`,
      [meta.projectId],
    );

    if (envResult.rows.length) {
      await runnerService.triggerRun({
        projectId:   meta.projectId,
        environmentId: envResult.rows[0].id,
        triggerType: 'CICD',
        userId:      'system',  // webhook runs are system-triggered
      });
    }

    res.json({ success: true, data: meta });
  } catch (err) { next(err); }
});

export default router;
