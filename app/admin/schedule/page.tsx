import { isAdmin } from "@/lib/admin";
import { formatDateOnly, formatTimeOnly } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { dateFromKey, dateKey, generateTimeList, getEffectiveDay, getSettingInt, overlaps, parseMinutes, combineDateAndTime } from "@/lib/schedule";
import { redirect } from "next/navigation";
import { saveScheduleMode } from "./actions";
import ScheduleClient from "./ScheduleClient";

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined, fallback = "") {
  return Array.isArray(value) ? value[0] || fallback : value || fallback;
}

function monthInfo(monthParam: string) {
  const now = new Date();
  const [y, m] = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const year = y;
  const monthIndex = m - 1;
  const first = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const prev = new Date(year, monthIndex - 1, 1);
  const next = new Date(year, monthIndex + 1, 1);
  const firstOffset = (first.getDay() + 6) % 7;

  return {
    year,
    monthIndex,
    key,
    firstOffset,
    lastDay,
    title: new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(first),
    prevKey: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`,
    nextKey: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`
  };
}

function dayLabel(kind: string, isWorkingDay: boolean) {
  if (kind === "SPECIAL") return "особенный";
  if (kind === "DAY_OFF") return "выходной";
  if (kind === "WORKING") return "рабочий";
  return isWorkingDay ? "рабочий" : "выходной";
}

export default async function SchedulePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (!isAdmin()) redirect("/admin/login");

  const month = monthInfo(one(searchParams.month));
  const selectedDateKey = one(searchParams.date);
  const selectedDay = selectedDateKey ? dateFromKey(selectedDateKey) : null;
  const warning = one(searchParams.warning);
  const success = one(searchParams.success);

  const monthStart = new Date(month.year, month.monthIndex, 1);
  const monthEnd = new Date(month.year, month.monthIndex + 1, 1);

  const [rules, settings, overrides, monthBookings, monthBlocks, onlineWindows, clients, services] = await Promise.all([
    prisma.scheduleRule.findMany({ orderBy: { weekday: "asc" } }),
    prisma.setting.findMany(),
    prisma.dayOverride.findMany({ where: { date: { gte: monthStart, lt: monthEnd } }, orderBy: { date: "asc" } }),
    prisma.booking.findMany({
      where: { startAt: { gte: monthStart, lt: monthEnd }, status: { in: ["PENDING", "CONFIRMED"] as any } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" }
    }),
    prisma.blockedSlot.findMany({ where: { startAt: { lt: monthEnd }, endAt: { gt: monthStart } }, orderBy: { startAt: "asc" } }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: monthStart, lt: monthEnd } }, orderBy: { startAt: "asc" } }),
    prisma.client.findMany({ where: { status: "APPROVED" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })
  ]);

  const stepMinutes = getSettingInt(settings, "SLOT_STEP_MINUTES", getSettingInt(settings, "slot_step_minutes", 30));
  const defaultRule = rules.find((item) => item.isWorkingDay) || rules[0];
  const defaultStartTime = defaultRule?.startTime || "09:00";
  const defaultEndTime = defaultRule?.endTime || "20:00";

  const days = Array.from({ length: month.lastDay }).map((_, index) => {
    const dayNumber = index + 1;
    const day = new Date(month.year, month.monthIndex, dayNumber);
    const key = dateKey(day);
    const effective = getEffectiveDay(day, rules, overrides);
    return {
      key,
      dayNumber,
      label: dayLabel(effective.kind, effective.isWorkingDay),
      kind: effective.kind,
      isWorkingDay: effective.isWorkingDay,
      bookingsCount: monthBookings.filter((item) => dateKey(item.startAt) === key).length,
      onlineCount: onlineWindows.filter((item) => dateKey(item.startAt) === key).length
    };
  });

  const selectedEffective = selectedDay ? getEffectiveDay(selectedDay, rules, overrides) : null;
  const selectedTimesRaw = selectedEffective ? generateTimeList(selectedEffective.startTime, selectedEffective.endTime, stepMinutes) : [];
  const selectedBookings = selectedDay ? monthBookings.filter((item) => dateKey(item.startAt) === dateKey(selectedDay)) : [];
  const selectedBlocks = selectedDay ? monthBlocks.filter((item) => dateKey(item.startAt) === dateKey(selectedDay) || dateKey(item.endAt) === dateKey(selectedDay)) : [];
  const selectedOnlineWindows = selectedDay ? onlineWindows.filter((item) => dateKey(item.startAt) === dateKey(selectedDay)) : [];

  const selectedTimes = selectedDay ? selectedTimesRaw.map((time) => {
    const slotStart = combineDateAndTime(selectedDay, time);
    const slotEnd = new Date(slotStart.getTime() + stepMinutes * 60_000);
    const booking = selectedBookings.find((item) => overlaps(slotStart, slotEnd, item.startAt, item.endAt));
    const block = selectedBlocks.find((item) => overlaps(slotStart, slotEnd, item.startAt, item.endAt));
    const busyLabel = booking
      ? `${booking.client.firstName} ${booking.client.lastName}`
      : block
        ? "закрытое окно"
        : "";
    return {
      time,
      busyLabel,
      isBusy: Boolean(booking || block),
      isOnline: selectedOnlineWindows.some((item) => formatTimeOnly(item.startAt) === time)
    };
  }) : [];

  return (
    <div className="grid">
      <section className="card">
        <h1>Расписание</h1>
        <p>Базовый режим задаёт шаг и рабочий день. В календаре можно отметить выходные/особенные дни, а в выбранном дне — открыть конкретные окна для онлайн-записи.</p>
        <div className="actions">
          <a className="button" href="/admin/schedule/free">Список онлайн-окон</a>
          <a className="button secondary" href="#mode">Редактор режима</a>
          <a className="button secondary" href="#calendar">Календарь окон</a>
          <a className="button secondary" href="/admin">Админка</a>
        </div>
      </section>

      <section className="card" id="mode">
        <h2>Редактор режима</h2>
        <p>Один общий режим на каждый день. Конкретные выходные и особенные дни отмечаются ниже в календаре.</p>
        <form action={saveScheduleMode} className="grid">
          <div className="grid-3">
            <label>Шаг времени
              <select name="stepMinutes" defaultValue={String(stepMinutes)}>
                <option value="15">15 минут</option>
                <option value="30">30 минут</option>
                <option value="45">45 минут</option>
                <option value="60">1 час</option>
                <option value="90">1,5 часа</option>
                <option value="150">2,5 часа</option>
              </select>
            </label>
            <label>Рабочий день с
              <input name="defaultStartTime" type="time" defaultValue={defaultStartTime} />
            </label>
            <label>Рабочий день до
              <input name="defaultEndTime" type="time" defaultValue={defaultEndTime} />
            </label>
          </div>
          <button>Сохранить режим на каждый день</button>
        </form>
      </section>

      <ScheduleClient
        monthKey={month.key}
        monthTitle={month.title}
        prevKey={month.prevKey}
        nextKey={month.nextKey}
        firstOffset={month.firstOffset}
        days={days}
        selectedDateKey={selectedDateKey}
        selectedDateTitle={selectedDay ? formatDateOnly(selectedDay) : ""}
        selectedIsWorkingDay={selectedEffective?.isWorkingDay ?? false}
        selectedTimes={selectedTimes}
        currentOnlineTimes={selectedOnlineWindows.map((item) => formatTimeOnly(item.startAt))}
        clients={clients.map((client) => ({ id: client.id, name: `${client.firstName} ${client.lastName}`, phone: client.phone }))}
        services={services.map((service) => ({ id: service.id, title: service.title, price: service.price, durationMinutes: service.durationMinutes }))}
        warning={warning}
        success={success}
      />
    </div>
  );
}
