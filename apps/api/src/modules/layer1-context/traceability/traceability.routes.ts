import { Router, Request, Response, NextFunction } from 'express';
import { TraceabilityService } from './traceability.service';

/**
 * Traceability routes
 *
 * GET  /traceability/:projectId                     → full matrix
 * GET  /traceability/:projectId/coverage            → aggregate metrics
 * GET  /traceability/:projectId/:reqId              → single requirement row
 * POST /traceability/:projectId/:reqId/tests        → link test cases
 * POST /traceability/:projectId/:reqId/defects      → link a defect
 *
 * :reqId accepts both UUID and external_id (e.g. REQ-IVA-001)
 */
const router = Router();
const service = new TraceabilityService();

// ── Full matrix ────────────────────────────────────────────────────────────
router.get('/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getMatrix(req.params.projectId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Coverage aggregate ────────────────────────────────────────────────────
// Must be registered BEFORE /:projectId/:reqId to avoid param collision
router.get('/:projectId/coverage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getCoverageAggregate(req.params.projectId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Single requirement row ─────────────────────────────────────────────────
router.get('/:projectId/:reqId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, reqId } = req.params;
    const data = await service.getRequirementRow(reqId, projectId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Link test cases to a requirement ───────────────────────────────────────
// Body: { testCaseIds: string[] }
router.post('/:projectId/:reqId/tests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, reqId } = req.params;
    const { testCaseIds } = req.body;
    if (!Array.isArray(testCaseIds) || !testCaseIds.length) {
      throw { status: 400, message: 'testCaseIds must be a non-empty array' };
    }
    const data = await service.linkTestCases(reqId, projectId, testCaseIds);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Link a defect to a requirement ────────────────────────────────────────
// Body: { defectId: string }  —  e.g. "DEF-IVA-001"
router.post('/:projectId/:reqId/defects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, reqId } = req.params;
    const { defectId } = req.body;
    if (!defectId) throw { status: 400, message: 'defectId is required' };
    // req.user is populated by the authenticate middleware
    const linkedBy = (req as any).user?.userId;
    const data = await service.linkDefect(reqId, projectId, defectId, linkedBy);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
