import { cookies } from "next/headers";
import { createHmac } from "crypto";

const COOKIE_NAME = "online_pen_admin";

function secret() {
  return process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || "dev-secret";
}

export function adminToken() {
  return createHmac("sha256", secret()).update("admin-session").digest("hex");
}

export function isAdmin() {
  return cookies().get(COOKIE_NAME)?.value === adminToken();
}

export function setAdminCookie() {
  cookies().set(COOKIE_NAME, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearAdminCookie() {
  cookies().delete(COOKIE_NAME);
}
