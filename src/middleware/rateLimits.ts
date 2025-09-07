import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../lib/cache.js";

export function rateLimit(opts: { keyPrefix: string; limit: number; windowSec: number }) {
  const { keyPrefix, limit, windowSec } = opts;
  const mem = new Map<string, { count: number; resetAt: number }>();

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.ip || req.headers["x-forwarded-for"] || "unknown").toString();
    const key = `${keyPrefix}:${ip}`;
    const redis = getRedisClient();

    // Redis path
    if (redis) {
      try {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, windowSec);
        const ttl = await redis.ttl(key);
        res.setHeader("X-RateLimit-Limit", String(limit));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
        res.setHeader("X-RateLimit-Reset", String(ttl));
        if (count > limit) {
          res.setHeader("Retry-After", String(ttl > 0 ? ttl : windowSec));
          return res.status(429).json({ error: "rate_limited" });
        }
        return next();
      } catch { /* fall through to memory */ }
    }

    // Memory fallback (dev)
    const now = Date.now();
    const cur = mem.get(key);
    if (!cur || now > cur.resetAt) {
      mem.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(limit - 1));
      res.setHeader("X-RateLimit-Reset", String(windowSec));
      return next();
    }
    cur.count++;
    const remaining = Math.max(0, limit - cur.count);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil((cur.resetAt - now) / 1000)));
    if (cur.count > limit) {
      res.setHeader("Retry-After", res.getHeader("X-RateLimit-Reset") as string);
      return res.status(429).json({ error: "rate_limited" });
    }
    next();
  };
}
