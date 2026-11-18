import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";

const deriveKey = promisify(scrypt);
const PASSWORD_KEY = "admin_password";
export const ADMIN_SESSION_VERSION_KEY = "admin_session_version";

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function matchesPassword(password: string, saved: string) {
  if (!saved.startsWith("scrypt$")) return false;
  const [, salt, digest] = saved.split("$");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(digest || "")) return false;
  const key = await deriveKey(password, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(digest, "hex"));
}

export async function verifyAdminPassword(password: string) {
  if (!password || password.length > 1024) return false;
  const rows = await prisma.setting.findMany({ where: { key: { in: [PASSWORD_KEY, ADMIN_SESSION_VERSION_KEY] } } });
  const row = rows.find((item) => item.key === PASSWORD_KEY);
  const version = rows.find((item) => item.key === ADMIN_SESSION_VERSION_KEY)?.value || "initial";
  const saved = row?.value || process.env.ADMIN_PASSWORD || "";
  if (!saved) return false;
  if (saved.startsWith("scrypt$")) return await matchesPassword(password, saved) ? version : false;
  // Upgrade the existing password on a successful login; no manual reset is needed.
  const actual = Buffer.from(password);
  const expected = Buffer.from(saved);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  const hashed = await hashPassword(password);
  if (row) {
    const result = await prisma.setting.updateMany({ where: { key: PASSWORD_KEY, value: saved }, data: { value: hashed } });
    if (!result.count) return false;
  } else {
    const result = await prisma.setting.createMany({ data: [{ key: PASSWORD_KEY, value: hashed }], skipDuplicates: true });
    if (!result.count) return false;
  }
  return version;
}

export async function changeAdminPassword(password: string, settings: Array<{ key: string; value: string }> = []) {
  const value = await hashPassword(password);
  const version = randomBytes(24).toString("hex");
  await prisma.$transaction([
    prisma.setting.upsert({ where: { key: PASSWORD_KEY }, create: { key: PASSWORD_KEY, value }, update: { value } }),
    prisma.setting.upsert({ where: { key: ADMIN_SESSION_VERSION_KEY }, create: { key: ADMIN_SESSION_VERSION_KEY, value: version }, update: { value: version } }),
    ...settings.map(({ key, value }) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }))
  ]);
}
