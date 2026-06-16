import { prisma } from "@/lib/prisma";

const ADMIN_PASSWORD_KEY = "admin_password";

export async function getAdminPassword() {
  const saved = await prisma.setting.findUnique({ where: { key: ADMIN_PASSWORD_KEY } });
  return saved?.value || process.env.ADMIN_PASSWORD || "";
}

export async function verifyAdminPassword(password: string) {
  const expected = await getAdminPassword();
  return Boolean(expected) && password === expected;
}

export async function changeAdminPassword(password: string) {
  await prisma.setting.upsert({
    where: { key: ADMIN_PASSWORD_KEY },
    create: { key: ADMIN_PASSWORD_KEY, value: password },
    update: { value: password }
  });
}
