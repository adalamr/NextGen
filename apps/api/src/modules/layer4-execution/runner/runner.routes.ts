import { Router, Request, Response, NextFunction } from 'express';
import { RunnerService } from './runner.service';

const router = Router();
const service = new RunnerService();

// ── GET /runner?projectId=&environmentId=&status=&page=&limit= ────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, environmentId, status, page, limit } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.listRuns(projectId as string, {
      environmentId: environmentId as string,
      status:        status        as string,
      page:  page  ? parseInt(page  as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

// ── GET /runner/:runId?projectId= ─────────────────────────────────────────
router.get('/:runId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getRun(req.params.runId, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /runner/:runId/results?projectId= ────────────────────────────────
router.get('/:runId/results', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getRunResults(req.params.runId, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /runner/trigger ─────────────────────────────────────────────────
// Body: { projectId, environmentId, scriptIds?, runnerType?, triggerType? }
router.post('/trigger', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, environmentId, scriptIds, runnerType, triggerType } = req.body;
    if (!projectId || !environmentId)
      throw { status: 400, message: 'projectId and environmentId are required' };
    const data = await service.triggerRun({
      projectId,
      environmentId,
      scriptIds,
      runnerType,
      triggerType,
      userId: req.user!.userId,
    });
    res.status(202).json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
