import { createHash } from "node:crypto";
import IORedis from "ioredis";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSecs: number;
};

const DEFAULT_REDIS_URL = "redis://localhost:6379";
const RATE_LIMIT_KEY_PREFIX = "mesh:rate-limit";

let redisClient: IORedis | undefined;

function getRedisClient() {
  if (!redisClient) {
    redisClient = new IORedis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
  }

  return redisClient;
}

export async function checkRateLimit(
  ip: string,
  limit: number,
  windowSecs: number
): Promise<RateLimitResult> {
  const safeLimit = Math.max(1, Math.trunc(limit));
  const safeWindowSecs = Math.max(1, Math.trunc(windowSecs));
  const now = Date.now();
  const windowMs = safeWindowSecs * 1_000;
  const windowId = Math.floor(now / windowMs);
  const resetAt = (windowId + 1) * windowMs;
  const key = getRateLimitKey(ip, windowId);
  const transaction = await getRedisClient()
    .multi()
    .incr(key)
    .expire(key, safeWindowSecs + 1)
    .exec();
  const counterResult = transaction?.[0];

  if (!counterResult || counterResult[0]) {
    throw counterResult?.[0] ?? new Error("Redis rate-limit counter failed.");
  }

  const used = Number(counterResult[1]);
  const remaining = Math.max(0, safeLimit - used);
  const retryAfterSecs = Math.max(1, Math.ceil((resetAt - now) / 1_000));

  return {
    allowed: used <= safeLimit,
    limit: safeLimit,
    remaining,
    resetAt,
    retryAfterSecs
  };
}

function getRateLimitKey(ip: string, windowId: number) {
  const normalizedIp = ip.trim() || "unknown";
  const subjectHash = createHash("sha256").update(normalizedIp).digest("hex").slice(0, 32);

  return `${RATE_LIMIT_KEY_PREFIX}:${subjectHash}:${windowId}`;
}
