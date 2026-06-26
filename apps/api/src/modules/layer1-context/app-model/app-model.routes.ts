import { Router, Request, Response, NextFunction } from 'express';
import { AppModelService } from './app-model.service';

const router = Router();
const service = new AppModelService();

// ── API Contracts ─────────────────────────────────────────────────────

// GET /app-model/api-contracts?projectId=&search=
router.get('/api-contracts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, search } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getApiContracts(projectId as string, search as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /app-model/api-contracts/:id?projectId=
router.get('/api-contracts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getApiContract(req.params.id, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /app-model/api-contracts
router.post('/api-contracts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, ...dto } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.upsertApiContract(projectId, dto);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// DELETE /app-model/api-contracts/:id?projectId=
router.delete('/api-contracts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.deleteApiContract(req.params.id, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── UI Pages ──────────────────────────────────────────────────────────

// GET /app-model/pages?projectId=&search=
router.get('/pages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, search } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getPages(projectId as string, search as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /app-model/pages/:id?projectId=
router.get('/pages/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getPage(req.params.id, projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /app-model/pages
router.post('/pages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, ...dto } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.upsertPage(projectId, dto);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── DB Schema ─────────────────────────────────────────────────────────

// GET /app-model/schema?projectId=
router.get('/schema', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getSchemaGraph(projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /app-model/schema
router.post('/schema', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, ...dto } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.upsertSchemaTable(projectId, dto);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── User Roles ────────────────────────────────────────────────────────

// GET /app-model/roles?projectId=
router.get('/roles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.getUserRoles(projectId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /app-model/roles
router.post('/roles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, ...dto } = req.body;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const data = await service.upsertUserRole(projectId, dto);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Summary (LLM context helper) ─────────────────────────────────────

// GET /app-model/summary?projectId=
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.query;
    if (!projectId) throw { status: 400, message: 'projectId is required' };
    const summary = await service.getSummary(projectId as string);
    res.json({ success: true, data: { summary } });
  } catch (err) { next(err); }
});

export default router;
