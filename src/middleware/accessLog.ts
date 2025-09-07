import type { Request, Response, NextFunction } from "express";

export function accessLog(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    const log = {
      t: new Date().toISOString(),
      level: "info",
      req_id: (req as any).id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      cache: (res.getHeader("X-Cache") as string) || "MISS",
    };
    console.log(JSON.stringify(log));
  });
  next();
}
