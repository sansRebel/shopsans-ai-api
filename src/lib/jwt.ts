// src/lib/jwt.ts
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../env.js";

export type JwtRole = "ADMIN" | "ANALYST" | "AGENT";
export type JwtPayload = { uid: string; role: JwtRole };

// Use the library's own type for expiresIn to satisfy TS
type Expires = NonNullable<SignOptions["expiresIn"]>;

export function signAccess(payload: JwtPayload, ttl: Expires = "2h") {
  const opts: SignOptions = { expiresIn: ttl };
  return jwt.sign(payload, env.JWT_SECRET, opts);
}

export function verifyAccess(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
