import { Router, Request, Response, NextFunction } from 'express';
import { TemplatesService } from './templates.service';

const router = Router();
const service = new TemplatesService();

// ── Input Templates (1A) ──────────────────────────────────────────────

// GET /templates/input?orgId=
router.get('/input', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const data = await service.getInputTemplates(orgId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /templates/input/active
router.get('/input/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const data = await service.getActiveInputTemplate(orgId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /templates/input/:id
router.get('/input/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const data = await service.getInputTemplate(req.params.id, orgId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /templates/input
router.post('/input', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    if (!req.body.name) throw { status: 400, message: 'name is required' };
    if (!req.body.schema) throw { status: 400, message: 'schema is required' };
    const data = await service.createInputTemplate(orgId, userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// PATCH /templates/input/:id
router.patch('/input/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const data = await service.updateInputTemplate(req.params.id, orgId, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Output Templates (1B) ─────────────────────────────────────────────

// GET /templates/output
router.get('/output', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const data = await service.getOutputTemplates(orgId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /templates/output/active
router.get('/output/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const data = await service.getActiveOutputTemplate(orgId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /templates/output
router.post('/output', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    if (!req.body.name) throw { status: 400, message: 'name is required' };
    if (!req.body.schema) throw { status: 400, message: 'schema is required' };
    const data = await service.createOutputTemplate(orgId, userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// PATCH /templates/output/:id
router.patch('/output/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const data = await service.updateOutputTemplate(req.params.id, orgId, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Sample I/O Pairs (1D) ─────────────────────────────────────────────

// GET /templates/sample-pairs?category=&search=&page=&limit=
router.get('/sample-pairs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const { category, search, page, limit } = req.query;
    const data = await service.getSamplePairs(orgId, {
      category: category as string,
      search: search as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

// GET /templates/sample-pairs/few-shot?category=&maxPairs=3
// Returns formatted few-shot text block for LLM injection
router.get('/sample-pairs/few-shot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const { category, maxPairs } = req.query;
    const fewShotBlock = await service.buildFewShotBlock(
      orgId,
      category as string,
      maxPairs ? parseInt(maxPairs as string, 10) : 3,
    );
    res.json({ success: true, data: { fewShotBlock } });
  } catch (err) { next(err); }
});

// POST /templates/sample-pairs
router.post('/sample-pairs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    if (!req.body.title) throw { status: 400, message: 'title is required' };
    if (!req.body.category) throw { status: 400, message: 'category is required' };
    if (!req.body.inputExample) throw { status: 400, message: 'inputExample is required' };
    if (!req.body.outputExample) throw { status: 400, message: 'outputExample is required' };
    const data = await service.createSamplePair(orgId, userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// PATCH /templates/sample-pairs/:id
router.patch('/sample-pairs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const data = await service.updateSamplePair(req.params.id, orgId, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// DELETE /templates/sample-pairs/:id
router.delete('/sample-pairs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const data = await service.deleteSamplePair(req.params.id, orgId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Knowledge Feedback / Gold Standards ──────────────────────────────

// POST /templates/feedback
router.post('/feedback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.orgId;
    const userId = req.user!.userId;
    const { projectId, testCaseId, matchPercentage, notes } = req.body;
    if (!projectId || !testCaseId || matchPercentage === undefined) {
      throw { status: 400, message: 'projectId, testCaseId and matchPercentage are required' };
    }
    const data = await service.submitFeedback(orgId, projectId, userId, { testCaseId, matchPercentage, notes });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /templates/gold-standards?projectId=
router.get('/gold-standards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getGoldStandardTestCases(projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
