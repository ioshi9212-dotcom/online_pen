import { isAdmin } from "@/lib/admin";
import { formatDateOnly, formatTimeOnly } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { combineDateAndTime, dateFromKey, dateKey, generateTimeList, getEffectiveDay, getSettingInt, overlaps } from "@/lib/schedule";
import { redirect } from "next/navigation";
import { saveScheduleMode } from "./actions";
import ScheduleClient from "./ScheduleClient";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type SelectedTime = {
  time: string;
  busyLabel: string;
  isBusy: boolean;
  isOnline: boolean;
  kind: "free" | "booking" | "block";
  endTime?: string;
  booking?: {
    id: string;
    status: string;
    clientId: string;
    clientName: string;
    serviceId: string;
    serviceTitle: string;
    durationMinutes: number;
    finalPrice: number | null;
    clientComment: string;
    adminComment: string;
  };
};

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

function Toast({ text }: { text: string }) {
  if (!text) return null;
  return <div className="notice ok-notice" style={{ position: "sticky", top: 12, zIndex: 20, boxShadow: "0 14px 32px rgba(126, 84, 100, .18)" }}>Готово: {text}</div>;
}

function ScheduleMenu() {
  return (
    <section className="card">
      <h2>Что открыть?</h2>
      <div className="admin-menu-grid">
        <a className="menu-card primary" href="/admin/schedule/free"><span className="menu-title">Список онлайн-окон</span><span className="menu-text">Только открытые окна для клиентов. Удобно скопировать или сделать скрин.</span></a>
        <a className="menu-card" href="/admin/schedule?view=mode"><span className="menu-title">Настройки записи</span><span className="menu-text">Шаг времени, рабочие часы и базовый режим на каждый день.</span></a>
        <a className="menu-card" href="/admin/schedule?view=calendar"><span className="menu-title">Календарь окон</span><span className="menu-text">Пометить выходные, открыть онлайн-окна и записать клиента вручную.</span></a>
      </div>
    </section>
  );
}

function buildSelectedTimes(params: {
  selectedDay: Date | null;
  rawTimes: string[];
  selectedBookings: Array<{ id: string; status: string; startAt: Date; endAt: Date; clientId: string; serviceId: string; finalPrice: number | null; clientComment: string; adminComment: string; client: { firstName: string; lastName: string }; service: { title: string; durationMinutes: number } }>;
  selectedBlocks: Array<{ startAt: Date; endAt: Date }>;
  selectedOnlineWindows: Array<{ startAt: Date }>;
  stepMinutes: number;
}): SelectedTime[] {
  const { selectedDay, rawTimes, selectedBookings, selectedBlocks, selectedOnlineWindows, stepMinutes } = params;
  if (!selectedDay) return [];

  const result: SelectedTime[] = [];

  for (const time of rawTimes) {
    const slotStart = combineDateAndTime(selectedDay, time);
    const slotEnd = new Date(slotStart.getTime() + stepMinutes * 60_000);
    const startsOnline = selectedOnlineWindows.some((item) => formatTimeOnly(item.startAt) === time);

    const bookingStart = selectedBookings.find((item) => item.startAt.getTime() === slotStart.getTime());
    if (bookingStart) {
      const pending = bookingStart.status === "PENDING";
      result.push({
        time,
        busyLabel: `${pending ? "ожидает подтверждения" : "занято"}: ${bookingStart.client.firstName} ${bookingStart.client.lastName} до ${formatTimeOnly(bookingStart.endAt)}`,
        isBusy: true,
        isOnline: startsOnline,
        kind: "booking",
        endTime: formatTimeOnly(bookingStart.endAt),
        booking: {
          id: bookingStart.id,
          status: bookingStart.status,
          clientId: bookingStart.clientId,
          clientName: `${bookingStart.client.firstName} ${bookingStart.client.lastName}`,
          serviceId: bookingStart.serviceId,
          serviceTitle: bookingStart.service.title,
          durationMinutes: bookingStart.service.durationMinutes,
          finalPrice: bookingStart.finalPrice,
          clientComment: bookingStart.clientComment,
          adminComment: bookingStart.adminComment
        }
      });
      continue;
    }

    const insideBooking = selectedBookings.some((item) => item.startAt < slotStart && item.endAt > slotStart);
    if (insideBooking) continue;

    const blockStart = selectedBlocks.find((item) => item.startAt.getTime() === slotStart.getTime());
    if (blockStart) {
      result.push({ time, busyLabel: `закрытое окно до ${formatTimeOnly(blockStart.endAt)}`, isBusy: true, isOnline: startsOnline, kind: "block", endTime: formatTimeOnly(blockStart.endAt) });
      continue;
    }

    const insideBlock = selectedBlocks.some((item) => item.startAt < slotStart && item.endAt > slotStart);
    if (insideBlock) continue;

    const overlapsBlock = selectedBlocks.find((item) => overlaps(slotStart, slotEnd, item.startAt, item.endAt));
    if (overlapsBlock) {
      result.push({ time, busyLabel: `закрытое окно до ${formatTimeOnly(overlapsBlock.endAt)}`, isBusy: true, isOnline: startsOnline, kind: "block", endTime: formatTimeOnly(overlapsBlock.endAt) });
      continue;
    }

    result.push({ time, busyLabel: "", isBusy: false, isOnline: startsOnline, kind: "free" });
  }

  return result;
}

export default async function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
  if (!isAdmin()) redirect("/admin/login");

  const month = monthInfo(one(searchParams.month));
  const selectedDateKey = one(searchParams.date);
  const requestedView = one(searchParams.view);
  const view = requestedView === "mode" || requestedView === "calendar" ? requestedView : selectedDateKey ? "calendar" : "menu";
  const selectedDay = selectedDateKey ? dateFromKey(selectedDateKey) : null;
  const warning = one(searchParams.warning);
  const success = one(searchParams.success);
  const done = one(searchParams.done);

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
    return { key, dayNumber, label: dayLabel(effective.kind, effective.isWorkingDay), kind: effective.kind, isWorkingDay: effective.isWorkingDay, bookingsCount: monthBookings.filter((item) => dateKey(item.startAt) === key).length, onlineCount: onlineWindows.filter((item) => dateKey(item.startAt) === key).length };
  });

  const selectedEffective = selectedDay ? getEffectiveDay(selectedDay, rules, overrides) : null;
  const selectedTimesRaw = selectedEffective ? generateTimeList(selectedEffective.startTime, selectedEffective.endTime, stepMinutes) : [];
  const selectedBookings = selectedDay ? monthBookings.filter((item) => dateKey(item.startAt) === dateKey(selectedDay)) : [];
  const selectedBlocks = selectedDay ? monthBlocks.filter((item) => dateKey(item.startAt) === dateKey(selectedDay) || dateKey(item.endAt) === dateKey(selectedDay)) : [];
  const selectedOnlineWindows = selectedDay ? onlineWindows.filter((item) => dateKey(item.startAt) === dateKey(selectedDay)) : [];
  const selectedTimes = buildSelectedTimes({ selectedDay, rawTimes: selectedTimesRaw, selectedBookings, selectedBlocks, selectedOnlineWindows, stepMinutes });

  return (
    <div className="grid">
      <section className="card">
        <h1>Расписание</h1>
        <p>Открывай только нужный раздел: онлайн-окна, настройки записи или календарь.</p>
        <div className="actions">
          <a className={view === "menu" ? "button" : "button secondary"} href="/admin/schedule">Разделы расписания</a>
          <a className="button secondary" href="/admin/schedule/free">Список онлайн-окон</a>
          <a className={view === "mode" ? "button" : "button secondary"} href="/admin/schedule?view=mode">Настройки записи</a>
          <a className={view === "calendar" ? "button" : "button secondary"} href={`/admin/schedule?view=calendar&month=${month.key}`}>Календарь окон</a>
          <a className="button secondary" href="/admin">Админка</a>
        </div>
      </section>

      <Toast text={done} />
      {view === "menu" ? <ScheduleMenu /> : null}

      {view === "mode" ? (
        <section className="card" id="mode">
          <h2>Настройки записи</h2>
          <p>Здесь задаётся базовый шаг времени и обычный рабочий день. Конкретные выходные, особенные дни и онлайн-окна отмечаются в календаре.</p>
          <form action={saveScheduleMode} className="grid">
            <div className="grid-3">
              <label>Шаг времени<select name="stepMinutes" defaultValue={String(stepMinutes)}><option value="15">15 минут</option><option value="30">30 минут</option><option value="45">45 минут</option><option value="60">1 час</option><option value="90">1,5 часа</option><option value="150">2,5 часа</option></select></label>
              <label>Рабочий день с<input name="defaultStartTime" type="time" defaultValue={defaultStartTime} /></label>
              <label>Рабочий день до<input name="defaultEndTime" type="time" defaultValue={defaultEndTime} /></label>
            </div>
            <button>Сохранить настройки записи</button>
          </form>
        </section>
      ) : null}

      {view === "calendar" ? (
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
      ) : null}
    </div>
  );
}
