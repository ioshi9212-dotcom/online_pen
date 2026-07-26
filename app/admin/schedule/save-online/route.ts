import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { combineDateAndTime, dateFromKey, dateKey as scheduleDateKey } from "@/lib/schedule";
import { NextResponse } from "next/server";

function safeJsonList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(String).map((item) => item.trim()).filter((item) => /^([01]\d|2[0-3]):[0-5]\d$/.test(item))));
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
  const { day, start, end } = dayRange(dateKey);
  if (scheduleDateKey(day) !== dateKey) {
    return NextResponse.json({ ok: false, error: "bad-date" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const [bookings, blocks] = await Promise.all([
      tx.booking.findMany({
        where: {
          status: { in: ["PENDING", "CONFIRMED"] },
          startAt: { lt: end },
          endAt: { gt: start }
        },
        select: { startAt: true, endAt: true }
      }),
      tx.blockedSlot.findMany({
        where: { startAt: { lt: end }, endAt: { gt: start } },
        select: { startAt: true, endAt: true }
      })
    ]);

    const savedTimes = times.filter((time) => {
      const startAt = combineDateAndTime(day, time);
      const conflict = bookings.some((booking) => booking.startAt <= startAt && booking.endAt > startAt);
      const block = blocks.some((slot) => slot.startAt <= startAt && slot.endAt > startAt);
      return !conflict && !block;
    });

    await tx.onlineWindow.deleteMany({ where: { startAt: { gte: start, lt: end } } });
    if (savedTimes.length) {
      await tx.onlineWindow.createMany({
        data: savedTimes.map((time) => ({
          startAt: combineDateAndTime(day, time),
          note: "Открыто для онлайн-записи"
        })),
        skipDuplicates: true
      });
    }

    return { savedTimes, skipped: times.length - savedTimes.length };
  });

  return NextResponse.json({
    ok: true,
    saved: result.savedTimes.length,
    skipped: result.skipped,
    savedTimes: result.savedTimes
  });
}
