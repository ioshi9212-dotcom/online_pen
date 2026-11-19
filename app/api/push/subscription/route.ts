import { isAdmin } from "@/lib/admin";
import { getClientCookie, getPendingCookie } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { sameOriginRequest } from "@/lib/sameOrigin";
import { pushConfiguration, validatePushSubscription, safePushEndpoint } from "@/lib/webPush";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type Role = "admin" | "client";
function json(error: string, status: number) { return NextResponse.json({ ok: false, error }, { status }); }

async function principal(role: Role) {
  if (role === "admin") return (await isAdmin()) ? { isAdmin: true, clientId: null } : null;
  const approvedToken = await getClientCookie();
  const pendingToken = await getPendingCookie();
  if (!approvedToken && !pendingToken) return null;
  const client = await prisma.client.findFirst({ where: {
    OR: [
      ...(approvedToken ? [{ publicToken: approvedToken, status: "APPROVED" as const }] : []),
      ...(pendingToken ? [{ publicToken: pendingToken, status: "PENDING" as const }] : [])
    ]
  }, select: { id: true } });
  if (!client) return null;
  return { isAdmin: false, clientId: client.id };
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return json("Недопустимый запрос", 403);
  const payload = await request.json().catch(() => null);
  const role = payload?.role as Role;
  if (role !== "admin" && role !== "client") return json("Некорректная роль", 400);
  const owner = await principal(role);
  if (!owner) return json("Сначала войдите в аккаунт", 401);
  if (!pushConfiguration()) return json("Push пока не настроен на сервере", 503);
  const subscription = validatePushSubscription(payload?.subscription);
  if (!subscription) return json("Браузер вернул неверную подписку", 400);
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, ...owner },
    update: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, ...owner }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request)) return json("Недопустимый запрос", 403);
  const payload = await request.json().catch(() => null);
  const role = payload?.role as Role;
  if (role !== "admin" && role !== "client") return json("Некорректная роль", 400);
  const owner = await principal(role);
  if (!owner) return json("Сначала войдите в аккаунт", 401);
  const endpoint = String(payload?.endpoint || "");
  if (!safePushEndpoint(endpoint)) return json("Некорректная подписка", 400);
  await prisma.pushSubscription.deleteMany({ where: { endpoint, ...owner } });
  return NextResponse.json({ ok: true });
}
