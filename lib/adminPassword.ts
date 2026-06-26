import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

const ADMIN_PASSWORD_KEY = "admin_password";
const HASH_PREFIX = "scrypt";

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${HASH_PREFIX}$${salt}$${hash}`;
}

function verifyHashedPassword(password: string, saved: string) {
  const [prefix, salt, savedHash] = saved.split("$");
  if (prefix !== HASH_PREFIX || !salt || !savedHash) return false;

  try {
    const expected = Buffer.from(savedHash, "hex");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function getAdminPassword() {
  const saved = await prisma.setting.findUnique({ where: { key: ADMIN_PASSWORD_KEY } });
  return saved?.value || process.env.ADMIN_PASSWORD || "";
}

export async function verifyAdminPassword(password: string) {
  const expected = await getAdminPassword();
  if (!expected) return false;

  if (expected.startsWith(`${HASH_PREFIX}$`)) {
    return verifyHashedPassword(password, expected);
  }

  // Backward compatibility: old DB value / ADMIN_PASSWORD may still be plaintext.
  // It will become hashed after the next password change in the admin profile.
  return password === expected;
}

export async function changeAdminPassword(password: string) {
  const value = hashPassword(password);
  await prisma.setting.upsert({
    where: { key: ADMIN_PASSWORD_KEY },
    create: { key: ADMIN_PASSWORD_KEY, value },
    update: { value }
  });
}
