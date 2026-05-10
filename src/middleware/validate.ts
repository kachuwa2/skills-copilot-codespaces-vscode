import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/response';

/**
 * Middleware factory that validates req.body against a Zod schema.
 * On failure returns 422 with field-level error messages.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      sendError(res, 'Validation failed', 422, errors);
      return;
    }
    req.body = result.data; // use parsed/coerced data
    next();
  };
}

/**
 * Middleware factory that validates req.query against a Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      sendError(res, 'Invalid query parameters', 422, errors);
      return;
    }
    (req as Request & { parsedQuery: unknown }).parsedQuery = result.data;
    next();
  };
}

function formatZodErrors(error: ZodError) {
  return error.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message,
  }));
}
