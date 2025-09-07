import crypto from "node:crypto";
import type { Request, Response } from "express";
import { getRedisClient } from "./cache.js";

/**
 * Sends JSON with server-side Redis caching:
 * - ETag (strong) + 304 support
 * - Cache-Control: private, max-age=...
 * - X-Cache: HIT|MISS
 * Supports ?nocache=1 or header x-no-cache: 1 to bypass.
 */
export async function respondWithCache<T>(
  req: Request,
  res: Response,
  key: string,
  ttlSec: number,
  compute: () => Promise<T>
) {
  const nocache = req.query.nocache === "1" || req.headers["x-no-cache"] === "1";
  const redis = getRedisClient();

  if (!nocache && redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        const etag = '"' + crypto.createHash("sha1").update(cached).digest("hex") + '"';
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", `private, max-age=${ttlSec}`);
        res.setHeader("X-Cache", "HIT");
        if (req.headers["if-none-match"] === etag) return res.status(304).end();
        return res.type("application/json").send(cached);
      }
    } catch { /* ignore */ }
  }

  const data = await compute();
  const body = JSON.stringify(data);
  const etag = '"' + crypto.createHash("sha1").update(body).digest("hex") + '"';

  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", `private, max-age=${ttlSec}`);
  res.setHeader("X-Cache", "MISS");

  if (!nocache && redis) {
    try { await redis.set(key, body, "EX", ttlSec); } catch { /* ignore */ }
  }

  return res.type("application/json").send(body);
}
