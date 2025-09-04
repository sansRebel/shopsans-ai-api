import type { Request, Response, NextFunction } from "express";
import { verifyAccess } from "../lib/jwt.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token =
    req.cookies?.access || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : undefined);

  if (!token) return res.status(401).json({ error: "unauthorized" });

  try {
    req.user = verifyAccess(token);
    return next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

export function requireRole(...roles: Array<"ADMIN" | "ANALYST" | "AGENT">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}
