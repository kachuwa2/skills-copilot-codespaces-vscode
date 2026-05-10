import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { sendError } from '../utils/response';
import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;      // user id
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

// Extend Express Request with authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Verifies the Bearer JWT token and attaches the payload to req.user.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 'Authentication required', 401);
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    sendError(res, 'Invalid or expired token', 401);
  }
}

/**
 * Role-based access control middleware.
 * Accepts one or more roles that are permitted to access the route.
 * Must be used AFTER authenticate().
 */
export function authorize(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Authentication required', 401);
      return;
    }
    if (!roles.includes(req.user.role)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }
    next();
  };
}

// Convenience sets for common role groups
export const AdminRoles = [Role.SUPER_ADMIN, Role.ADMIN] as Role[];
export const ManagerRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER] as Role[];
export const StaffRoles = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGER,
  Role.CASHIER,
  Role.WAREHOUSE_STAFF,
] as Role[];
export const AllRoles = Object.values(Role) as Role[];
