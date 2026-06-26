import { Router, Request, Response, NextFunction } from 'express';
import { TestCaseGeneratorService } from './test-case-generator.service';

const router = Router();
const service = new TestCaseGeneratorService();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getTestCases(req.query.projectId as string, req.query as any);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getTestCase(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.generateTestCases(req.body, req.user!.userId);
    res.status(202).json({ success: true, message: 'Generation queued', data });
  } catch (err) { next(err); }
});

router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.updateStatus(req.params.id, req.body.status, req.user!.userId, req.body.reason);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
