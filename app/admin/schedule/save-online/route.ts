import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { combineDateAndTime, dateFromKey } from "@/lib/schedule";
import { NextResponse } from "next/server";

function safeJsonList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function dayRange(key: string) {
  const day = dateFromKey(key);
  const start = combineDateAndTime(day, "00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { day, start, end };
}

export async function POST(request: Request) {
  if (!isAdmin()) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { date?: string; times?: unknown } | null;
  const dateKey = String(body?.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return NextResponse.json({ ok: false, error: "bad-date" }, { status: 400 });
  }

  const times = safeJsonList(body?.times).sort();
  const savedTimes: string[] = [];
  const { day, start, end } = dayRange(dateKey);
  let skipped = 0;

  await prisma.onlineWindow.deleteMany({ where: { startAt: { gte: start, lt: end } } });

  for (const time of times) {
    const startAt = combineDateAndTime(day, time);
    const conflict = await prisma.booking.findFirst({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] as any },
        startAt: { lte: startAt },
        endAt: { gt: startAt }
      }
    });
    const block = await prisma.blockedSlot.findFirst({ where: { startAt: { lte: startAt }, endAt: { gt: startAt } } });

    if (conflict || block) {
      skipped += 1;
      continue;
    }

    await prisma.onlineWindow.upsert({
      where: { startAt },
      create: { startAt, note: "Открыто для онлайн-записи" },
      update: { note: "Открыто для онлайн-записи" }
    });
    savedTimes.push(time);
  }

  return NextResponse.json({ ok: true, saved: savedTimes.length, skipped, savedTimes });
}
