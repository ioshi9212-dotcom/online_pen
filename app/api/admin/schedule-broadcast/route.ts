import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { sameOriginRequest } from "@/lib/sameOrigin";
import { parseScheduleMessage, SCHEDULE_ANNOUNCEMENT_KEY, SCHEDULE_BROADCAST_COOLDOWN_MS } from "@/lib/scheduleAnnouncement";
import { pushConfiguration, sendWebPush } from "@/lib/webPush";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const allowedStatuses = ["PENDING", "APPROVED"] as const;

function error(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return error("Недопустимый запрос", 403);
  if (!(await isAdmin())) return error("Только для мастера", 401);
  const input = await request.json().catch(() => null);
  const message = parseScheduleMessage(input);
  if (!message) return error("Заголовок: 1–80 символов. Текст: 5–240 символов.", 400);

  let enabled = false;
  try { enabled = Boolean(pushConfiguration()); }
  catch { return error("Проверьте ключи Web Push в Amvera.", 503); }

  const cutoff = new Date(Date.now() - SCHEDULE_BROADCAST_COOLDOWN_MS);
  const previous = await prisma.setting.findUnique({ where: { key: SCHEDULE_ANNOUNCEMENT_KEY } });
  if (previous && previous.updatedAt > cutoff) return error("Повторить рассылку можно через 5 минут.", 429);

  const announcement = JSON.stringify({ ...message, publishedAt: new Date().toISOString() });
  // Atomic claim in PostgreSQL; double clicks / concurrent admins cannot spam everyone.
  if (previous) {
    const updated = await prisma.setting.updateMany({
      where: { key: SCHEDULE_ANNOUNCEMENT_KEY, updatedAt: { lt: cutoff } },
      data: { value: announcement }
    });
    if (updated.count !== 1) return error("Рассылка уже выполняется. Попробуйте позже.", 429);
  } else {
    try { await prisma.setting.create({ data: { key: SCHEDULE_ANNOUNCEMENT_KEY, value: announcement } }); }
    catch (cause) {
      if (cause && typeof cause === "object" && "code" in cause && cause.code === "P2002")
        return error("Рассылка уже выполняется. Попробуйте позже.", 429);
      throw cause;
    }
  }

  const eligible = { isAdmin: false, client: { status: { in: [...allowedStatuses] } } };
  const devices = await prisma.pushSubscription.count({ where: eligible });
  if (!enabled || devices === 0)
    return NextResponse.json({ ok: true, published: true, pushEnabled: enabled, devices, accepted: 0, failed: 0 });

  let accepted = 0, failed = 0;
  const expiredIds: string[] = [];
  let cursor: string | undefined;
  do {
    const rows = await prisma.pushSubscription.findMany({
      where: eligible, select: { id: true, endpoint: true, p256dh: true, auth: true },
      orderBy: { id: "asc" }, take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;
    // Small batches keep CPU and network activity modest on the starter Amvera tariff.
    for (let i = 0; i < rows.length; i += 8) {
      await Promise.all(rows.slice(i, i + 8).map(async row => {
        try {
          const result = await sendWebPush(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            { ...message, url: "/login", tag: "schedule-open" }
          );
          if (result.expired) expiredIds.push(row.id);
          if (result.delivered) accepted++;
          else failed++;
        } catch (cause) {
          failed++;
          console.warn("Schedule broadcast push failed:", cause instanceof Error ? cause.message : "unknown");
        }
      }));
    }
    if (rows.length < 50) break;
  } while (true);
  // Delete only after paging; removing the page cursor mid-send breaks pagination.
  if (expiredIds.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
  return NextResponse.json({ ok: true, published: true, pushEnabled: enabled, devices, accepted, failed });
}
