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

export function getRedisClient(): Redis | null {
  return client;
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

/** Dev-friendly invalidation that deletes keys by prefix (SCANS). */
export async function invalidateByPrefix(prefix: string): Promise<number> {
  if (!client) return 0;
  let cursor = "0", deleted = 0;
  do {
    const [cur, keys] = await client.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
    cursor = cur;
    if (keys.length) deleted += await client.del(keys);
  } while (cursor !== "0");
  return deleted;
}
