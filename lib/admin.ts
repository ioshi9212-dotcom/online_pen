import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_VERSION_KEY } from "@/lib/adminPassword";
import { readSession, signSession } from "@/lib/signedSession";

const COOKIE_NAME = "online_pen_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

async function currentVersion() {
  const row = await prisma.setting.findUnique({ where: { key: ADMIN_SESSION_VERSION_KEY } });
  return row?.value || "initial";
}

export async function isAdmin() {
  const version = readSession((await cookies()).get(COOKIE_NAME)?.value, "admin");
  return Boolean(version) && version === await currentVersion();
}

export async function setAdminCookie(version?: string) {
  (await cookies()).set(COOKIE_NAME, signSession(version ?? await currentVersion(), "admin", MAX_AGE_SECONDS), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE_SECONDS
  });
}

export async function clearAdminCookie() {
  (await cookies()).delete(COOKIE_NAME);
}
