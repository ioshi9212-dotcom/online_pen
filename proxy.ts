import { NextRequest, NextResponse } from "next/server";

async function validSignature(value: string) {
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "v1" || !/^\d+$/.test(parts[1]) || Number(parts[1]) <= Date.now() / 1000 || !/^[a-f0-9]{64}$/.test(parts[4])) return false;
  const secret = process.env.ADMIN_SECRET;
  if ((!secret || secret.length < 32) && process.env.NODE_ENV === "production") return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret || "development-only-session-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(parts[4].match(/../g)!, (byte) => parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(`admin:${parts.slice(0, 4).join(".")}`));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin/login" || pathname === "/admin/logout") return NextResponse.next();
  if (await validSignature(request.cookies.get("online_pen_admin")?.value || "")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

// Database-backed revocation is checked again in every page/action/route guard.
export const config = { matcher: ["/admin/:path*"] };
