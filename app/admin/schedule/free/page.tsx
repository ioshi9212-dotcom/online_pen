import { isAdmin } from "@/lib/admin";
import { formatTimeOnly } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { businessDateKey, formatInBusinessTime } from "@/lib/timezone";
import { redirect } from "next/navigation";
import FreeWindowsClient from "./FreeWindowsClient";

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined, fallback = "") {
  return Array.isArray(value) ? value[0] || fallback : value || fallback;
}

function dayTitle(date: Date) {
  const month = formatInBusinessTime(date, { month: "long" });
  const day = formatInBusinessTime(date, { day: "numeric" });
  const weekday = formatInBusinessTime(date, { weekday: "short" }).replace(".", "");
  return `${day} ${month} ${weekday}`;
}

function pointBusy(point: Date, busyItems: { startAt: Date; endAt: Date }[]) {
  return busyItems.some((item) => item.startAt <= point && item.endAt > point);
}

export default async function FreeWindowsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (!isAdmin()) redirect("/admin/login");

  const done = one(searchParams.done);
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 90);

  const [allWindows, activeBookings, blocks] = await Promise.all([
    prisma.onlineWindow.findMany({ where: { startAt: { gte: now, lt: horizon } }, orderBy: { startAt: "asc" } }),
    prisma.booking.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] as any }, startAt: { lt: horizon }, endAt: { gt: now } },
      select: { startAt: true, endAt: true }
    }),
    prisma.blockedSlot.findMany({ where: { startAt: { lt: horizon }, endAt: { gt: now } }, select: { startAt: true, endAt: true } })
  ]);

  const windows = allWindows.filter((window) => !pointBusy(window.startAt, activeBookings) && !pointBusy(window.startAt, blocks));
  const hiddenCount = allWindows.length - windows.length;

  const grouped = windows.reduce<Record<string, typeof windows>>((acc, item) => {
    const key = businessDateKey(item.startAt);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

  const groups = Object.entries(grouped).map(([key, items]) => ({
    key,
    title: dayTitle(items[0].startAt),
    items: items.map((item) => ({ id: item.id, time: formatTimeOnly(item.startAt) }))
  }));

  return (
    <section className="grid">
      <div className="card">
        <h1>Список онлайн-окон</h1>
        <p>Это только окна, которые вручную открыты и сейчас не заняты активными записями или закрытыми окнами.</p>
        <div className="actions">
          <a className="button secondary" href="/admin/schedule">Разделы расписания</a>
          <a className="button secondary" href="/admin/schedule?view=mode">Настройки записи</a>
          <a className="button secondary" href="/admin/schedule?view=calendar">Календарь окон</a>
          <a className="button secondary" href="/admin">Админка</a>
        </div>
      </div>

      {done ? <div className="notice ok-notice" style={{ position: "sticky", top: 12, zIndex: 20 }}>Готово: {done}</div> : null}
      {hiddenCount ? <div className="notice">Скрыто занятых или закрытых окон: {hiddenCount}. Они не попали в список для копирования.</div> : null}

      <FreeWindowsClient initialGroups={groups} />
    </section>
  );
}
