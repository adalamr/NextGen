import { Router, Request, Response, NextFunction } from 'express';
import { ProjectService } from './projects.service';

const router = Router();
const service = new ProjectService();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projects = await service.getProjects(req.user!.orgId);
    res.json({ success: true, data: projects });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await service.getProject(req.params.id, req.user!.orgId);
    res.json({ success: true, data: project });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await service.createProject(req.user!.orgId, req.user!.userId, req.body);
    res.status(201).json({ success: true, data: project });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await service.updateProject(req.params.id, req.user!.orgId, req.body);
    res.json({ success: true, data: project });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await service.deleteProject(req.params.id, req.user!.orgId);
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) { next(err); }
});

export default router;
