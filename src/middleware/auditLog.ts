import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuditAction, Prisma } from '@prisma/client';

interface AuditOptions {
  action: AuditAction;
  entityType: string;
  getEntityId?: (req: Request, res: Response) => string | undefined;
  getDescription?: (req: Request) => string;
}

/**
 * Middleware factory to automatically log sensitive actions to the audit log.
 * Place AFTER the route handler so the response body is available.
 *
 * Usage:
 *   router.post('/login', loginHandler, auditLog({ action: AuditAction.LOGIN, entityType: 'User' }))
 */
export function auditLog(options: AuditOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Fire-and-forget — we never want audit logging to block the response
    const userId = req.user?.sub;
    const entityId = options.getEntityId?.(req, res);
    const description = options.getDescription?.(req);

    prisma.auditLog
      .create({
        data: {
          userId: userId ?? null,
          action: options.action,
          entityType: options.entityType,
          entityId: entityId ?? null,
          description: description ?? null,
          ipAddress: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null,
          newValues: req.body ? (sanitizeBody(req.body) as Prisma.InputJsonValue) : undefined,
        },
      })
      .catch(() => {
        // Swallow audit log failures silently — don't break business flow
      });

    next();
  };
}

/**
 * Remove sensitive fields before storing to audit log.
 */
function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['password', 'passwordHash', 'token', 'secret'];
  const sanitized = { ...body };
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  return sanitized;
}

/**
 * Direct audit log creation — for use inside service functions.
 */
export async function createAuditLog(params: {
  userId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldValues?: object;
  newValues?: object;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      oldValues: params.oldValues ? (params.oldValues as Prisma.InputJsonValue) : undefined,
      newValues: params.newValues ? (params.newValues as Prisma.InputJsonValue) : undefined,
      description: params.description ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}
