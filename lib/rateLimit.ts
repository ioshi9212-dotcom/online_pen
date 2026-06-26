type RateLimitOptions = {
  limit: number;
  windowMs: number;
  blockMs?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
  blockedUntil: number;
};

const buckets = new Map<string, Bucket>();

function nowMs() {
  return Date.now();
}

function freshBucket(now: number, windowMs: number): Bucket {
  return { count: 0, resetAt: now + windowMs, blockedUntil: 0 };
}

export function checkRateLimit(key: string, options: RateLimitOptions) {
  const now = nowMs();
  const blockMs = options.blockMs ?? options.windowMs;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = freshBucket(now, options.windowMs);
  }

  if (bucket.blockedUntil > now) {
    buckets.set(key, bucket);
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000)
    };
  }

  bucket.count += 1;

  if (bucket.count > options.limit) {
    bucket.blockedUntil = now + blockMs;
    buckets.set(key, bucket);
    return {
      ok: false,
      retryAfterSeconds: Math.ceil(blockMs / 1000)
    };
  }

  buckets.set(key, bucket);
  return { ok: true, retryAfterSeconds: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
