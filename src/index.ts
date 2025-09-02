import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { env } from "./env.js";

const app = express();
const log = pino({ name: "shopsans-api" });

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());

// keep abusive traffic in check even in dev
const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use(limiter);

app.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    env: env.NODE_ENV,
    version: "0.1.0"
  });
});

const server = app.listen(env.PORT, () => {
  log.info(`API listening on :${env.PORT}`);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
