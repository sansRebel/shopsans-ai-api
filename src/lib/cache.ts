import Redis from "ioredis";

let client: Redis | null = null;
try {
  client = new Redis({
    host: process.env.REDIS_HOST || "redis",
    port: Number(process.env.REDIS_PORT || 6379),
    lazyConnect: true,
  });
  client.connect().catch(() => { client = null; });
} catch {
  client = null;
}

export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  if (!client) return fn();
  try {
    const hit = await client.get(key);
    if (hit) return JSON.parse(hit) as T;
    const val = await fn();
    await client.set(key, JSON.stringify(val), "EX", ttlSec);
    return val;
  } catch {
    return fn();
  }
}
