import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "online_pen_admin";
const LOGIN_PATH = "/admin/login";
const LOGOUT_PATH = "/admin/logout";

function secret() {
  return process.env.ADMIN_SECRET || "dev-secret";
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function adminToken() {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode("admin-session"));
  return toHex(signature);
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === LOGIN_PATH || pathname.startsWith(LOGOUT_PATH)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value || "";
  const expected = await adminToken();

  if (cookie === expected) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = LOGIN_PATH;
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"]
};
