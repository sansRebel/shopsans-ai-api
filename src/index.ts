import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pino from "pino";
import cookieParser from "cookie-parser"; 
import { env } from "./env.js";
import { authRouter } from "./routes/auth.routes.js"; 
import { requireAuth, requireRole } from "./middleware/auth.js"; 
import { customersRouter } from "./routes/customer.routes.js";
import { productsRouter } from "./routes/product.routes.js";
import { ordersRouter } from "./routes/order.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { analyticsRouter } from "./routes/analytics.routes.js";

const app = express();
const log = pino({ name: "shopsans-api" });

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser()); 

const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use(limiter);

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime(), env: env.NODE_ENV, version: "0.1.0" });
});

app.use("/auth", authRouter); 

// Example protected route
app.get("/secure/ping", requireAuth, requireRole("ADMIN","ANALYST","AGENT"), (_req, res) => {
  res.json({ ok: true, when: new Date().toISOString() });
});

app.use("/customers", requireAuth, customersRouter);
app.use("/products", requireAuth, productsRouter);
app.use("/orders", requireAuth, ordersRouter);
app.use("/search", searchRouter);
app.use("/analytics", requireAuth, analyticsRouter);

const server = app.listen(env.PORT, () => log.info(`API listening on :${env.PORT}`));
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
