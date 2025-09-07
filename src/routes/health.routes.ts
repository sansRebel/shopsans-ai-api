import { Router } from "express";
import { prisma } from "../db.js";
import { getRedisClient } from "../lib/cache.js";

export const healthRouter = Router();

healthRouter.get("/healthz", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

healthRouter.get("/readyz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const r = getRedisClient();
    if (r) await r.ping();
    res.json({ ok: true, db: true, redis: !!r });
  } catch {
    res.status(503).json({ ok: false });
  }
});
