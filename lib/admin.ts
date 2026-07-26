import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "online_pen_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret() {
  const value = process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD;

  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SECRET or ADMIN_PASSWORD is required in production");
  }

  return value || "dev-secret";
}

export function adminToken() {
  return createHmac("sha256", secret()).update("admin-session").digest("hex");
}

export function isAdmin() {
  const current = Buffer.from(cookies().get(COOKIE_NAME)?.value || "");
  const expected = Buffer.from(adminToken());
  return current.length === expected.length && timingSafeEqual(current, expected);
}

export function setAdminCookie() {
  cookies().set(COOKIE_NAME, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
}

export function clearAdminCookie() {
  cookies().delete(COOKIE_NAME);
}
