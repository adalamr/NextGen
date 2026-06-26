import { Router, Request, Response, NextFunction } from 'express';
import { EnvironmentService } from './environment.service';

const router = Router();
const service = new EnvironmentService();

// ── GET /environments?projectId= ──────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.listEnvironments(projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── GET /environments/:id?projectId= ───────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getEnvironment(req.params.id, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST /environments ─────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, ...dto } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.createEnvironment(projectId, dto);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── PATCH /environments/:id ───────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, ...dto } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.updateEnvironment(req.params.id, projectId, dto);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── DELETE /environments/:id?projectId= ───────────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.deleteEnvironment(req.params.id, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
