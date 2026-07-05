import type { NextFunction, Request, Response } from "express";
import { z, type ZodError, type ZodTypeAny } from "zod";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Invalid request body", details: formatZodError(result.error) });
    }
    req.body = result.data;
    return next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: "Invalid query parameters", details: formatZodError(result.error) });
    }
    req.query = result.data as any;
    return next();
  };
}

export const idParam = z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9_.:-]+$/, "Invalid identifier");
export const optionalDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().or(z.literal(""));
export const safeText = (max = 255) => z.string().trim().max(max);
