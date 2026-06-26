import { Router, Request, Response, NextFunction } from 'express';
import { ConnectorsService } from './connectors.service';

const router = Router();
const service = new ConnectorsService();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getConnectors(req.query.projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.createConnector(req.body.projectId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/trigger', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.triggerIngestion(req.params.id, req.body.trigger || 'MANUAL');
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getIngestionRuns(req.query.projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
