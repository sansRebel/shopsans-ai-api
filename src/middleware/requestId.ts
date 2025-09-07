import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const rid = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  (req as any).id = rid;
  res.setHeader("X-Request-Id", rid);
  next();
}
