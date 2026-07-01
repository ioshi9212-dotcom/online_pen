import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "online_pen_client";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

function secret() {
  const value = process.env.CLIENT_SESSION_SECRET || process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD;

  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("CLIENT_SESSION_SECRET or ADMIN_SECRET is required in production");
  }

  return value || "dev-client-secret";
}

function sign(token: string) {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function encodeClientCookie(token: string) {
  return `${token}.${sign(token)}`;
}

function decodeClientCookie(value: string | undefined) {
  if (!value) return "";
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex <= 0) return "";

  const token = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);
  if (!token || !signature) return "";
  if (!safeEqual(signature, sign(token))) return "";

  return token;
}

export function getClientCookie() {
  return decodeClientCookie(cookies().get(COOKIE_NAME)?.value);
}

export function setClientCookie(token: string) {
  cookies().set(COOKIE_NAME, encodeClientCookie(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
}

export function clearClientCookie() {
  cookies().delete(COOKIE_NAME);
}
