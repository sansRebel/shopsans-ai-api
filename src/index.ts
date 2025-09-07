import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pino from "pino";
import cookieParser from "cookie-parser";

import { env } from "./env.js";
import { requestId } from "./middleware/requestId.js";
import { accessLog } from "./middleware/accessLog.js";
import { rateLimit } from "./middleware/rateLimits.js";

import { healthRouter } from "./routes/health.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { customersRouter } from "./routes/customer.routes.js";
import { productsRouter } from "./routes/product.routes.js";
import { ordersRouter } from "./routes/order.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { analyticsRouter } from "./routes/analytics.routes.js";

const app = express();
const log = pino({ name: "shopsans-api" });

// Security & core middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.set("etag", "strong");   // strong ETag; combine with per-response ETag where used
app.use(compression());      // gzip/brotli if supported
app.use(requestId);          // X-Request-Id on every request
app.use(accessLog);          // JSON access log (one line per request)

// Health checks
app.use("/", healthRouter);

// Auth
app.use("/auth", authRouter);

// Example protected route
app.get(
  "/secure/ping",
  requireAuth,
  requireRole("ADMIN", "ANALYST", "AGENT"),
  (_req, res) => res.json({ ok: true, when: new Date().toISOString() })
);

// Domain routes (require auth)
app.use("/customers", requireAuth, customersRouter);
app.use("/products", requireAuth, productsRouter);
app.use("/orders", requireAuth, ordersRouter);

// Search (public route with rate limit; auth enforced inside handlers where needed)
app.use(
  "/search",
  rateLimit({ keyPrefix: "rl:search", limit: 180, windowSec: 60 }),
  searchRouter
);

// Analytics (auth + rate limit)
app.use(
  "/analytics",
  requireAuth,
  rateLimit({ keyPrefix: "rl:analytics", limit: 120, windowSec: 60 }),
  analyticsRouter
);

// Global error handler (keep last)
app.use((
  err: any,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  console.error("Unhandled error:", err);
  res.status(err?.status ?? 500).json({ error: err?.code ?? "server_error" });
});

const server = app.listen(env.PORT, () => {
  log.info(`API listening on :${env.PORT}`);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());

export default app;
