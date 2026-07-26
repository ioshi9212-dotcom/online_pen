import { prisma } from "@/lib/prisma";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const ADMIN_PASSWORD_KEY = "admin_password";
const HASH_PREFIX = "scrypt$v1";
const scrypt = promisify(scryptCallback);

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${HASH_PREFIX}$${salt}$${derived.toString("hex")}`;
}

async function verifyHash(password: string, value: string) {
  const [algorithm, version, salt, expectedHex] = value.split("$");
  if (`${algorithm}$${version}` !== HASH_PREFIX || !salt || !expectedHex) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  return safeEqual(derived.toString("hex"), expectedHex);
}

export async function getAdminPassword() {
  const saved = await prisma.setting.findUnique({ where: { key: ADMIN_PASSWORD_KEY } });
  return saved?.value || process.env.ADMIN_PASSWORD || "";
}

export async function verifyAdminPassword(password: string) {
  const expected = await getAdminPassword();
  if (!expected) return false;

  if (expected.startsWith(`${HASH_PREFIX}$`)) {
    return verifyHash(password, expected);
  }

  const valid = safeEqual(password, expected);
  if (valid) {
    const value = await hashPassword(password);
    await prisma.setting.upsert({
      where: { key: ADMIN_PASSWORD_KEY },
      create: { key: ADMIN_PASSWORD_KEY, value },
      update: { value }
    });
  }
  return valid;
}

export async function changeAdminPassword(password: string) {
  const value = await hashPassword(password);
  await prisma.setting.upsert({
    where: { key: ADMIN_PASSWORD_KEY },
    create: { key: ADMIN_PASSWORD_KEY, value },
    update: { value }
  });
}
