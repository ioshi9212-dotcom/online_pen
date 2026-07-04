import { isAdmin } from "@/lib/admin";
import { formatDateOnly, formatTimeOnly } from "@/lib/format";
import { getOnlineBookingHideDays, onlineBookingHideDaysLabel } from "@/lib/onlineBookingCutoff";
import { prisma } from "@/lib/prisma";
import { combineDateAndTime, dateFromKey, dateKey, generateTimeList, getEffectiveDay, getSettingInt, overlaps } from "@/lib/schedule";
import { redirect } from "next/navigation";
import { todayBusinessDateKey } from "@/lib/timezone";
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

type OpenOnlineWindow = {
  id: string;
  startAt: Date;
};

const monthLabels = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const shortWeekDays = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

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

function onlineWindowDayTitle(date: Date) {
  const key = dateKey(date);
  const [year, month, day] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${monthLabels[month - 1] || ""} ${day} ${shortWeekDays[weekday] || ""}`.trim();
}

function pointBusy(point: Date, busyItems: { startAt: Date; endAt: Date }[]) {
  return busyItems.some((item) => item.startAt <= point && item.endAt > point);
}

function Toast({ text }: { text: string }) {
  if (!text) return null;
  return <div className="notice ok-notice" style={{ position: "sticky", top: 12, zIndex: 20, boxShadow: "0 14px 32px rgba(126, 84, 100, .18)" }}>Готово: {text}</div>;
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

  const todayKey = todayBusinessDateKey();
  const month = monthInfo(one(searchParams.month, todayKey.slice(0, 7)));
  const requestedView = one(searchParams.view);
  const view = requestedView === "mode" ? "mode" : "calendar";
  const requestedDateKey = one(searchParams.date);
  const selectedDateKey = view === "calendar" ? (requestedDateKey || (todayKey.startsWith(month.key) ? todayKey : `${month.key}-01`)) : requestedDateKey;
  const selectedDay = selectedDateKey ? dateFromKey(selectedDateKey) : null;
  const warning = one(searchParams.warning);
  const success = one(searchParams.success);
  const done = one(searchParams.done);

  const monthStart = new Date(month.year, month.monthIndex, 1);
  const monthEnd = new Date(month.year, month.monthIndex + 1, 1);
  const now = new Date();
  const onlineHorizon = new Date(now);
  onlineHorizon.setDate(onlineHorizon.getDate() + 90);

  const [rules, settings, overrides, monthBookings, monthBlocks, monthOnlineWindows, futureOnlineWindows, futureBookings, futureBlocks, clients, services] = await Promise.all([
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
    prisma.onlineWindow.findMany({ where: { startAt: { gte: now, lt: onlineHorizon } }, orderBy: { startAt: "asc" } }),
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] as any }, startAt: { lt: onlineHorizon }, endAt: { gt: now } }, select: { startAt: true, endAt: true } }),
    prisma.blockedSlot.findMany({ where: { startAt: { lt: onlineHorizon }, endAt: { gt: now } }, select: { startAt: true, endAt: true } }),
    prisma.client.findMany({ where: { status: "APPROVED" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })
  ]);

  const stepMinutes = getSettingInt(settings, "SLOT_STEP_MINUTES", getSettingInt(settings, "slot_step_minutes", 30));
  const onlineHideDays = getOnlineBookingHideDays(settings);
  const defaultRule = rules.find((item) => item.isWorkingDay) || rules[0];
  const defaultStartTime = defaultRule?.startTime || "09:00";
  const defaultEndTime = defaultRule?.endTime || "20:00";

  const days = Array.from({ length: month.lastDay }).map((_, index) => {
    const dayNumber = index + 1;
    const day = new Date(month.year, month.monthIndex, dayNumber);
    const key = dateKey(day);
    const effective = getEffectiveDay(day, rules, overrides);
    return { key, dayNumber, label: dayLabel(effective.kind, effective.isWorkingDay), kind: effective.kind, isWorkingDay: effective.isWorkingDay, bookingsCount: monthBookings.filter((item) => dateKey(item.startAt) === key).length, onlineCount: monthOnlineWindows.filter((item) => dateKey(item.startAt) === key).length };
  });

  const visibleFutureOnlineWindows: OpenOnlineWindow[] = futureOnlineWindows.filter((onlineWindow) => !pointBusy(onlineWindow.startAt, futureBookings) && !pointBusy(onlineWindow.startAt, futureBlocks));
  const groupedOnlineWindows = visibleFutureOnlineWindows.reduce<Record<string, OpenOnlineWindow[]>>((acc, item) => {
    const key = dateKey(item.startAt);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
  const openOnlineGroups = Object.entries(groupedOnlineWindows).map(([key, items]) => ({
    key,
    title: onlineWindowDayTitle(items[0].startAt),
    items: items.map((item) => ({ id: item.id, time: formatTimeOnly(item.startAt) }))
  }));

  const selectedEffective = selectedDay ? getEffectiveDay(selectedDay, rules, overrides) : null;
  const selectedTimesRaw = selectedEffective ? generateTimeList(selectedEffective.startTime, selectedEffective.endTime, stepMinutes) : [];
  const selectedBookings = selectedDay ? monthBookings.filter((item) => dateKey(item.startAt) === dateKey(selectedDay)) : [];
  const selectedBlocks = selectedDay ? monthBlocks.filter((item) => dateKey(item.startAt) === dateKey(selectedDay) || dateKey(item.endAt) === dateKey(selectedDay)) : [];
  const selectedOnlineWindows = selectedDay ? monthOnlineWindows.filter((item) => dateKey(item.startAt) === dateKey(selectedDay)) : [];
  const selectedTimes = buildSelectedTimes({ selectedDay, rawTimes: selectedTimesRaw, selectedBookings, selectedBlocks, selectedOnlineWindows, stepMinutes });

  return (
    <div className="grid admin-schedule-page">
      <section className="card schedule-top-card">
        <p className="eyebrow">Кабинет мастера</p>
        <h1>{view === "mode" ? "Настройки записи" : "Календарь"}</h1>
        <p>{view === "mode" ? "Здесь задаётся базовый режим записи: шаг времени, рабочий день и насколько близкие онлайн-окна видны клиентам." : "Нажми на день — ниже сразу откроются окна для клиентов и ручная запись."}</p>
        <div className="actions schedule-tabs">
          <a className={view === "calendar" ? "button" : "button secondary"} href={`/admin/schedule?view=calendar&month=${month.key}&date=${selectedDateKey || todayKey}`}>Календарь</a>
          <a className={view === "mode" ? "button" : "button secondary"} href="/admin/schedule?view=mode">Настройки записи</a>
          <a className="button secondary schedule-free-link" href="/admin/schedule/free">Онлайн-окна списком</a>
        </div>
      </section>

      <Toast text={done} />

      {view === "mode" ? (
        <section className="card" id="mode">
          <h2>Настройки записи</h2>
          <p>Здесь задаётся базовый шаг времени, обычный рабочий день и какие ближайшие онлайн-окна скрывать от клиентов.</p>
          <form action={saveScheduleMode} className="grid">
            <div className="grid-3">
              <label>Шаг времени<select name="stepMinutes" defaultValue={String(stepMinutes)}><option value="15">15 минут</option><option value="30">30 минут</option><option value="45">45 минут</option><option value="60">1 час</option><option value="90">1,5 часа</option><option value="150">2,5 часа</option></select></label>
              <label>Рабочий день с<input name="defaultStartTime" type="time" defaultValue={defaultStartTime} /></label>
              <label>Рабочий день до<input name="defaultEndTime" type="time" defaultValue={defaultEndTime} /></label>
            </div>
            <label className="notice online-cutoff-setting">
              Онлайн-запись клиентам
              <select name="onlineHideDays" defaultValue={String(onlineHideDays)}>
                <option value="-1">Показывать все открытые окна</option>
                <option value="0">Не показывать окна на сегодня</option>
                <option value="1">Не показывать окна на сегодня и завтра</option>
                <option value="2">Не показывать окна на ближайшие 2 дня</option>
                <option value="3">Не показывать окна на ближайшие 3 дня</option>
              </select>
              <small>{onlineBookingHideDaysLabel(onlineHideDays)}. Окна у мастера не удаляются, просто клиент их не увидит.</small>
            </label>
            <button type="submit">Сохранить настройки записи</button>
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
          openOnlineGroups={openOnlineGroups}
          clients={clients.map((client) => ({ id: client.id, name: `${client.firstName} ${client.lastName}`, phone: client.phone }))}
          services={services.map((service) => ({ id: service.id, title: service.title, price: service.price, durationMinutes: service.durationMinutes }))}
          warning={warning}
          success={success}
        />
      ) : null}
    </div>
  );
}
