import { Request, Response, NextFunction } from 'express';
import { childLogger } from '../utils/logger';

const log = childLogger('layer1:http');

/**
 * Layer 1 request / response logger.
 *
 * Logs every inbound Layer 1 API call with:
 *   - HTTP method + path
 *   - Resolved userId / orgId from JWT (populated by `authenticate` before this runs)
 *   - projectId from params, query, or body (whichever is present first)
 *   - Response status code
 *   - Round-trip duration in milliseconds
 *
 * Mount this AFTER `authenticate` on all Layer 1 route groups so that
 * `req.user` is already populated when the log entry is written.
 *
 * Example output (pretty mode):
 *   2025-01-15 10:22:03 [info] [layer1:http]: POST /api/v1/projects/abc/requirements
 *   { userId: "u1", orgId: "o1", projectId: "abc", status: 201, durationMs: 34 }
 */
export function layer1RequestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = Date.now();

  // Resolve projectId from wherever it lives for this route
  const projectId: string | undefined =
    req.params.projectId ||
    (req.query.projectId as string | undefined) ||
    (req.body?.projectId as string | undefined);

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const statusCode = res.statusCode;
    const method     = req.method;
    const path       = req.originalUrl ?? req.path;

    const meta: Record<string, unknown> = {
      userId:     req.user?.userId ?? 'unauthenticated',
      orgId:      req.user?.orgId  ?? 'unknown',
      status:     statusCode,
      durationMs,
    };
    if (projectId) meta.projectId = projectId;

    if (statusCode >= 500) {
      log.error(`${method} ${path}`, meta);
    } else if (statusCode >= 400) {
      log.warn(`${method} ${path}`, meta);
    } else {
      log.info(`${method} ${path}`, meta);
    }
  });

  next();
}
