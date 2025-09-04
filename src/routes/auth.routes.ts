import { Router } from "express";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { loginSchema, registerSchema } from "../schemas/auth.schema.js";
import { signAccess } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";

const prisma = new PrismaClient();
export const authRouter = Router();

const cookieOpts = (isProd: boolean) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProd,
  maxAge: 2 * 60 * 60 * 1000 // 2h
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password, role } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "email_in_use" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: role ?? "AGENT" }
  });

  const token = signAccess({ uid: user.id, role: user.role });
  res.cookie("access", token, cookieOpts(process.env.NODE_ENV === "production"));
  res.status(201).json({ id: user.id, email: user.email, role: user.role });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const token = signAccess({ uid: user.id, role: user.role });
  res.cookie("access", token, cookieOpts(process.env.NODE_ENV === "production"));
  res.json({ id: user.id, email: user.email, role: user.role, token });
});

authRouter.post("/logout", async (_req, res) => {
  const base = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  res.clearCookie("access", base);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const prisma = new PrismaClient();
  const uid = req.user!.uid; // set by requireAuth from cookie or Authorization: Bearer
  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { id: true, email: true, role: true }
  });
  res.json({ user });
});
