import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { readSession, signSession } from "@/lib/signedSession";

const COOKIE_NAME = "online_pen_client";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function getClientCookie() {
  return readSession((await cookies()).get(COOKIE_NAME)?.value, "client");
}

export async function requireClient() {
  const token = await getClientCookie();
  if (!token) redirect("/login");
  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client) redirect("/login");
  if (client.status !== "APPROVED") redirect("/unavailable");
  return client;
}

export async function setClientCookie(token: string) {
  (await cookies()).set(COOKIE_NAME, signSession(token, "client", MAX_AGE_SECONDS), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE_SECONDS
  });
}

export async function clearClientCookie() {
  (await cookies()).delete(COOKIE_NAME);
}
