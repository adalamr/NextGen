import { Router, Request, Response, NextFunction } from 'express';
import { FeedbackService } from './feedback.service';

/**
 * Feedback routes — nested under /api/v1/test-cases
 *
 * POST /test-cases/:testCaseId/feedback
 *   Submit 3-dimension quality feedback (one-shot, requester only).
 *   Body: { projectId, clarity: 1-5, correctness: 1-5, coverage: 1-5, notes? }
 *
 * GET  /test-cases/:testCaseId/feedback?projectId=
 *   Retrieve all feedback records for a test case.
 *
 * GET  /test-cases/feedback/prompt-context?projectId=&requirementId=
 *   Return aggregated weakness signals for LLM prompt injection.
 *   Used internally by the test case generation service.
 */
const router = Router({ mergeParams: true });
const service = new FeedbackService();

// ── POST /test-cases/:testCaseId/feedback ─────────────────────────────────
router.post(
  '/:testCaseId/feedback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { testCaseId } = req.params;
      const { projectId, clarity, correctness, coverage, notes } = req.body;

      if (!projectId)   throw { status: 400, message: 'projectId is required' };
      if (!clarity)     throw { status: 400, message: 'clarity is required' };
      if (!correctness) throw { status: 400, message: 'correctness is required' };
      if (!coverage)    throw { status: 400, message: 'coverage is required' };

      // userId comes from the JWT via authenticate middleware
      const userId = (req as any).user?.userId;
      if (!userId) throw { status: 401, message: 'Unauthorised' };

      const data = await service.submitFeedback(
        testCaseId,
        projectId,
        userId,
        { clarity, correctness, coverage, notes },
      );
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  },
);

// ── GET /test-cases/:testCaseId/feedback?projectId= ───────────────────────
router.get(
  '/:testCaseId/feedback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { testCaseId } = req.params;
      const { projectId } = req.query;
      if (!projectId) throw { status: 400, message: 'projectId is required' };

      const data = await service.getFeedback(testCaseId, projectId as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
);

// ── GET /test-cases/feedback/prompt-context?projectId=&requirementId= ────
// Must be registered BEFORE /:testCaseId to avoid param collision
router.get(
  '/feedback/prompt-context',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, requirementId } = req.query;
      if (!projectId) throw { status: 400, message: 'projectId is required' };

      const data = await service.getPromptContext(
        projectId as string,
        requirementId as string | undefined,
      );
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
);

export default router;
