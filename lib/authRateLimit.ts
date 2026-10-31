import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { consumeBucket, type Bucket } from "@/lib/rateLimit";
import { sessionSecret } from "@/lib/signedSession";

export async function allowAuthAttempt(scope: "client" | "admin", identity = "") {
  const requestHeaders = await headers();
  // Amvera's reverse proxy sets the forwarded address. Raw addresses/phones are
  // never persisted. An identity limit also applies when proxy headers are absent.
  const ip = (requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip") || "unknown").split(",")[0].trim().slice(0, 100);
  const key = (value: string) => `auth_rate:${createHmac("sha256", sessionSecret("admin")).update(value).digest("hex")}`;
  const checks = [{ key: key(`${scope}:ip:${ip}`), limit: 40 }, { key: key(`${scope}:total`), limit: scope === "admin" ? 20 : 500 }];
  if (identity) checks.push({ key: key(`${scope}:identity:${identity}`), limit: 10 });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(726416, 2)`;
    let allowed = true;
    for (const check of checks) {
      const row = await tx.setting.findUnique({ where: { key: check.key } });
      let bucket: Bucket | undefined;
      try { bucket = row ? JSON.parse(row.value) : undefined; } catch { bucket = undefined; }
      const result = consumeBucket(bucket, { limit: check.limit, windowMs: 15 * 60_000, blockMs: 30 * 60_000 });
      const value = JSON.stringify(result.bucket);
      await tx.setting.upsert({ where: { key: check.key }, create: { key: check.key, value }, update: { value } });
      allowed = allowed && result.ok;
    }
    await tx.setting.deleteMany({ where: { key: { startsWith: "auth_rate:" }, updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } });
    return allowed;
  }, { maxWait: 10_000, timeout: 15_000 });
}
