type RateLimitOptions = {
  limit: number;
  windowMs: number;
  blockMs?: number;
};

export type Bucket = {
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

export function consumeBucket(bucket: Bucket | undefined, options: RateLimitOptions, now = Date.now()) {
  if (bucket && bucket.blockedUntil > now) return { bucket, ok: false, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) };
  const current = !bucket || bucket.resetAt <= now ? freshBucket(now, options.windowMs) : { ...bucket };
  current.count += 1;
  if (current.count > options.limit) current.blockedUntil = now + (options.blockMs ?? options.windowMs);
  return { bucket: current, ok: current.blockedUntil <= now, retryAfterSeconds: Math.max(0, Math.ceil((current.blockedUntil - now) / 1000)) };
}

export function checkRateLimit(key: string, options: RateLimitOptions) {
  const now = nowMs();
  const blockMs = options.blockMs ?? options.windowMs;
  let bucket = buckets.get(key);

  if (bucket?.blockedUntil && bucket.blockedUntil > now) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) };
  }
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
  if (buckets.size > 10_000) {
    for (const [name, value] of Array.from(buckets)) if (value.resetAt <= now && value.blockedUntil <= now) buckets.delete(name);
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
