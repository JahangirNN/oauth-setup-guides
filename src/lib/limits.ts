/**
 * Generation is the expensive, abuse-sensitive part of the demo. These limits
 * are deliberately small and configurable: local development stays open, while
 * a deployed demo can require an access code and cap both per-IP and global use.
 */

export const MAX_INPUT_CHARS = 160;
export const DEFAULT_PER_IP_LIMIT = 3;
export const DEFAULT_PER_IP_WINDOW_SECONDS = 15 * 60;
export const DEFAULT_DAILY_LIMIT = 40;
export const DEFAULT_MAX_CONCURRENT = 2;
const ACTIVE_SECONDS = 330;

type HeadersLike = Pick<Headers, "get">;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function inputTooLong(input: string): boolean {
  return input.length > envInt("GENERATE_MAX_INPUT", MAX_INPUT_CHARS, 1, 2_000);
}

export function accessCodeRequired(): boolean {
  return Boolean(process.env.GENERATE_ACCESS_CODE?.trim());
}

export function hasValidAccessCode(headers: HeadersLike): boolean {
  const expected = process.env.GENERATE_ACCESS_CODE?.trim();
  if (!expected) return true;

  const supplied =
    headers.get("x-demo-code")?.trim() ||
    headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";

  return supplied.length > 0 && supplied === expected;
}

/** Vercel supplies x-forwarded-for; x-real-ip is a useful fallback locally. */
export function requestIp(headers: HeadersLike): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  const value = forwarded || real || "local";
  return value.replace(/[^a-zA-Z0-9.:_-]/g, "").slice(0, 120) || "local";
}

function envLimits() {
  return {
    perIp: envInt("GENERATE_PER_IP_LIMIT", DEFAULT_PER_IP_LIMIT, 1, 100),
    windowSeconds: envInt(
      "GENERATE_PER_IP_WINDOW_MINUTES",
      DEFAULT_PER_IP_WINDOW_SECONDS / 60,
      1,
      24 * 60
    ) * 60,
    daily: envInt("GENERATE_DAILY_LIMIT", DEFAULT_DAILY_LIMIT, 1, 10_000),
    concurrent: envInt("GENERATE_MAX_CONCURRENT", DEFAULT_MAX_CONCURRENT, 1, 20),
  };
}

export interface GenerationLimitSummary {
  accessCodeRequired: boolean;
  perIpLimit: number;
  perIpWindowMinutes: number;
  dailyLimit: number;
  maxConcurrent: number;
  maxInputChars: number;
}

export function generationLimitSummary(): GenerationLimitSummary {
  const limits = envLimits();
  return {
    accessCodeRequired: accessCodeRequired(),
    perIpLimit: limits.perIp,
    perIpWindowMinutes: Math.round(limits.windowSeconds / 60),
    dailyLimit: limits.daily,
    maxConcurrent: limits.concurrent,
    maxInputChars: envInt("GENERATE_MAX_INPUT", MAX_INPUT_CHARS, 1, 2_000),
  };
}

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, MemoryBucket>();
const memoryActive = new Set<string>();
let memoryDay = { key: "", count: 0 };

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(upstashUrl && upstashToken);

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(`${upstashUrl}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstashToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

function deny(
  status: 401 | 413 | 429,
  message: string,
  retryAfter?: number
): GenerationGuard {
  return { allowed: false, status, message, retryAfter, release: async () => undefined };
}

export interface GenerationGuard {
  allowed: boolean;
  status?: 401 | 413 | 429;
  message?: string;
  retryAfter?: number;
  release: () => Promise<void>;
}

function memoryGuard(ip: string, now: number, limits: ReturnType<typeof envLimits>): GenerationGuard {
  const dayKey = new Date(now).toISOString().slice(0, 10);
  if (memoryDay.key !== dayKey) memoryDay = { key: dayKey, count: 0 };

  const windowIndex = Math.floor(now / (limits.windowSeconds * 1000));
  const bucketKey = `${ip}:${windowIndex}`;
  const bucket = memoryBuckets.get(bucketKey);
  if (bucket && bucket.count >= limits.perIp) {
    return deny(
      429,
      "This IP has reached the demo generation limit. Try again later.",
      Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    );
  }
  if (memoryDay.count >= limits.daily) {
    return deny(429, "The demo has reached its daily generation limit. Try again tomorrow.");
  }
  if (memoryActive.has(ip)) {
    return deny(429, "A generation is already running for this IP. Wait for it to finish.");
  }
  if (memoryActive.size >= limits.concurrent) {
    return deny(429, "The demo is already running its maximum number of generations. Try again shortly.");
  }

  const resetAt = (windowIndex + 1) * limits.windowSeconds * 1000;
  memoryBuckets.set(bucketKey, { count: (bucket?.count ?? 0) + 1, resetAt });
  memoryDay.count++;
  memoryActive.add(ip);

  // Bound the in-memory map for long-running local processes.
  if (memoryBuckets.size > 2_000) {
    for (const [key, value] of memoryBuckets) {
      if (value.resetAt <= now) memoryBuckets.delete(key);
    }
  }

  return {
    allowed: true,
    release: async () => {
      memoryActive.delete(ip);
    },
  };
}

async function decrementGlobal(key: string): Promise<void> {
  const remaining = Number(await redis(["DECR", key]));
  if (remaining <= 0) await redis(["DEL", key]);
}

async function redisGuard(
  ip: string,
  now: number,
  limits: ReturnType<typeof envLimits>
): Promise<GenerationGuard> {
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const windowIndex = Math.floor(now / (limits.windowSeconds * 1000));
  const ipKey = `limit:ip:${ip}:${windowIndex}`;
  const dayKeyName = `limit:day:${dayKey}`;

  const used = Number(await redis(["INCR", ipKey]));
  if (used === 1) await redis(["EXPIRE", ipKey, String(limits.windowSeconds)]);
  if (used > limits.perIp) {
    return deny(
      429,
      "This IP has reached the demo generation limit. Try again later.",
      limits.windowSeconds
    );
  }

  const dayUsed = Number(await redis(["INCR", dayKeyName]));
  if (dayUsed === 1) await redis(["EXPIRE", dayKeyName, String(2 * 24 * 60 * 60)]);
  if (dayUsed > limits.daily) {
    return deny(429, "The demo has reached its daily generation limit. Try again tomorrow.");
  }

  const globalKey = "active:generation:global";
  const globalCount = Number(await redis(["INCR", globalKey]));
  if (globalCount === 1) await redis(["EXPIRE", globalKey, String(ACTIVE_SECONDS)]);
  if (globalCount > limits.concurrent) {
    await decrementGlobal(globalKey);
    return deny(429, "The demo is already running its maximum number of generations. Try again shortly.");
  }

  const activeKey = `active:generation:${ip}`;
  const acquired = await redis(["SET", activeKey, "1", "EX", String(ACTIVE_SECONDS), "NX"]);
  if (acquired !== "OK") {
    await decrementGlobal(globalKey);
    return deny(429, "A generation is already running for this IP. Wait for it to finish.");
  }

  return {
    allowed: true,
    release: async () => {
      try {
        await redis(["DEL", activeKey]);
        await decrementGlobal(globalKey);
      } catch {
        // Both keys expire on their own; cleanup is best-effort.
      }
    },
  };
}

/**
 * Checks the optional access code, input size, per-IP quota, global daily cap,
 * and single-flight lock. Call `release` when the stream finishes.
 */
export async function beginGeneration(request: Request, input: string): Promise<GenerationGuard> {
  if (!hasValidAccessCode(request.headers)) {
    return deny(401, "A demo access code is required. Add it to the generator form.");
  }

  if (inputTooLong(input)) {
    return deny(
      413,
      `App names and URLs are limited to ${generationLimitSummary().maxInputChars} characters.`
    );
  }

  const now = Date.now();
  const limits = envLimits();
  const ip = requestIp(request.headers);

  if (useRedis) {
    try {
      return await redisGuard(ip, now, limits);
    } catch (error) {
      // A Redis outage must not take down the demo. The in-memory fallback is
      // per-instance, but it still caps this process.
      console.warn("Upstash rate limit failed; using in-memory fallback", error);
    }
  }

  return memoryGuard(ip, now, limits);
}
