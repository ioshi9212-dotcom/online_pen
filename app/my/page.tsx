import { cancelClientBooking, joinWaitlist } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  client?: string;
  date?: string;
  created?: string;
  waitlist?: string;
  cancelled?: string;
  login?: string;
  known?: string;
};

type OnlineWindowItem = {
  id: string;
  startAt: Date;
};

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(date);
}

function fmtMonth(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
}

function fmtTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthOffset(date: Date) {
  return (startOfMonth(date).getDay() + 6) % 7;
}

function groupByDate(items: OnlineWindowItem[]) {
  return items.reduce((map, item) => {
    const key = dayKey(item.startAt);
    map.set(key, [...(map.get(key) || []), item]);
    return map;
  }, new Map<string, OnlineWindowItem[]>());
}

function statusText(status: string) {
  if (status === "PENDING") return "Ожидает подтверждения";
  if (status === "CONFIRMED") return "Подтверждена";
  if (status === "COMPLETED") return "Завершена";
  if (status === "CANCELLED_BY_CLIENT") return "Отменена вами";
  if (status === "CANCELLED_BY_ADMIN") return "Отменена мастером";
  if (status === "REJECTED") return "Отклонена";
  return status;
}

function statusClass(status: string) {
  if (status === "PENDING") return "status wait";
  if (status === "CONFIRMED") return "status ok";
  if (["CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED"].includes(status)) return "status danger-status";
  return "status";
}

function dateOptions(days = 14) {
  const result: { value: string; label: string }[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let index = 0; index < days; index++) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    result.push({
      value: dayKey(date),
      label: new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", weekday: "short" }).format(date)
    });
  }
  return result;
}

function noticeText(searchParams: SearchParams) {
  if (searchParams.created) return "Заявка отправлена. Окно уже закреплено за вами.";
  if (searchParams.waitlist) return "Вы в листе ожидания. Мастер увидит пожелания.";
  if (searchParams.cancelled) return "Запись отменена.";
  if (searchParams.login) return "Вход выполнен.";
  if (searchParams.known) return "Вы уже есть в базе. Можно записываться.";
  return "";
}

export default async function MyPage({ searchParams }: { searchParams: SearchParams }) {
  const token = searchParams.client;
  if (!token) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { publicToken: token },
    include: {
      bookings: { include: { service: true }, orderBy: { startAt: "asc" } },
      waitlist: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } }
    }
  });

  if (!client) redirect("/login");
  if (client.status !== "APPROVED") redirect("/unavailable");

  const [services, onlineWindows, busyBookings] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }], take: 6 }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 80 }),
    prisma.booking.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gte: new Date() } },
      select: { startAt: true, endAt: true }
    })
  ]);

  const busyStartSet = new Set(busyBookings.map((booking) => booking.startAt.toISOString()));
  const freeWindows = onlineWindows.filter((window) => !busyStartSet.has(window.startAt.toISOString()));
  const allWindowsByDate = groupByDate(onlineWindows);
  const freeByDate = groupByDate(freeWindows);
  const firstAvailableDate = Array.from(freeByDate.keys()).sort()[0] || dayKey(new Date());
  const selectedDateKey = searchParams.date && allWindowsByDate.has(searchParams.date) ? searchParams.date : firstAvailableDate;
  const selectedDate = new Date(`${selectedDateKey}T00:00:00`);
  const selectedWindows = allWindowsByDate.get(selectedDateKey) || [];
  const selectedFreeCount = selectedWindows.filter((window) => !busyStartSet.has(window.startAt.toISOString())).length;
  const selectedBusyCount = selectedWindows.length - selectedFreeCount;
  const monthBase = selectedWindows[0]?.startAt || selectedDate;
  const firstService = services[0];
  const activeBookings = client.bookings.filter((booking) => ["PENDING", "CONFIRMED"].includes(booking.status));
  const mainBooking = activeBookings[0];
  const note = noticeText(searchParams);
  const monthDays = Array.from({ length: daysInMonth(monthBase) }, (_, index) => index + 1);

  return (
    <main className="page client-page">
      {note ? <div className="notice ok-status">{note}</div> : null}

      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>Свободные окна и запись</h1>
        <p className="lead">{client.firstName}, выберите дату, время и отправьте заявку.</p>
      </section>

      <section className="info-cards">
        <article className="info-card">
          <h3>Свободные окна</h3>
          <p>Показываем только актуальные свободные даты и время.</p>
          <a className="button" href="#windows">Выбрать время</a>
        </article>
        <article className="info-card" id="current">
          <h3>Ваша запись</h3>
          <p>{mainBooking ? `${fmtDate(mainBooking.startAt)}, ${fmtTime(mainBooking.startAt)}` : "Активной записи пока нет."}</p>
          <a className="button secondary" href="#my-booking">Посмотреть</a>
        </article>
        <article className="info-card">
          <h3>Лист ожидания</h3>
          <p>Если всё занято — можно оставить пожелания.</p>
          <a className="button secondary" href="#waitlist">Встать в лист ожидания</a>
        </article>
      </section>

      <section className="calendar-layout" id="windows">
        <article className="calendar-card">
          <h2>Ближайшие свободные даты</h2>
          <div className="actions" style={{ justifyContent: "space-between", marginTop: 12 }}>
            <span className="button secondary" aria-disabled="true">‹</span>
            <b>{fmtMonth(monthBase)}</b>
            <span className="button secondary" aria-disabled="true">›</span>
          </div>
          <div className="calendar-head">{["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {Array.from({ length: monthOffset(monthBase) }).map((_, index) => <span className="day-btn muted" key={`empty-${index}`}></span>)}
            {monthDays.map((day) => {
              const date = new Date(monthBase.getFullYear(), monthBase.getMonth(), day);
              const key = dayKey(date);
              const hasFree = (freeByDate.get(key) || []).length > 0;
              const active = key === selectedDateKey;
              return hasFree ? (
                <a key={key} className={active ? "day-btn active" : "day-btn"} href={`/my?client=${token}&date=${key}#windows`}>
                  <span>{day}</span><i className="dot" />
                </a>
              ) : (
                <span key={key} className="day-btn muted" aria-disabled="true"><span>{day}</span></span>
              );
            })}
          </div>
        </article>

        <article className="selected-day-card card">
          <p className="muted">Выбранная дата</p>
          <h2>{fmtDate(selectedDate)}</h2>
          <p>{selectedBusyCount} занято · {selectedFreeCount} свободно</p>
          <div className="time-grid">
            {selectedWindows.map((window) => {
              const isBusy = busyStartSet.has(window.startAt.toISOString());
              const href = firstService ? `/booking?client=${token}&service=${firstService.id}&time=${encodeURIComponent(window.startAt.toISOString())}#confirm` : `/price?client=${token}`;
              return isBusy ? (
                <span key={window.id} className="time-btn busy" aria-disabled="true"><b>{fmtTime(window.startAt)}</b><span>Занято</span></span>
              ) : (
                <a key={window.id} className="time-btn free" href={href}><b>{fmtTime(window.startAt)}</b><span>Свободно</span></a>
              );
            })}
            {selectedWindows.length === 0 ? <div className="empty-state"><p>На эту дату открытых окон нет.</p></div> : null}
          </div>
        </article>
      </section>

      <section className="card current-booking-card" id="my-booking">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Ваша запись</h2>
            {mainBooking ? (
              <>
                <p><b>{fmtDate(mainBooking.startAt)}, {fmtTime(mainBooking.startAt)}</b></p>
                <p>{mainBooking.service.title} · {rub(mainBooking.finalPrice ?? mainBooking.service.price)}</p>
                <span className={statusClass(mainBooking.status)}>{statusText(mainBooking.status)}</span>
                {mainBooking.status === "PENDING" ? <p className="pending-booking-text">Окно уже закреплено за вами. Осталось дождаться подтверждения мастера.</p> : null}
              </>
            ) : (
              <p>Активной записи нет. Выберите свободное окно выше.</p>
            )}
          </div>
          {mainBooking ? (
            <details>
              <summary className="button secondary">Отменить</summary>
              <form action={cancelClientBooking} className="grid" style={{ marginTop: 12 }}>
                <input type="hidden" name="clientToken" value={token} />
                <input type="hidden" name="bookingId" value={mainBooking.id} />
                <button type="submit" className="danger">Да, отменить</button>
              </form>
            </details>
          ) : <a className="button" href="#windows">Выбрать время</a>}
        </div>
      </section>

      <section className="top-split" id="how">
        <article className="card">
          <h2>Пошагово</h2>
          <div className="steps">
            <div className="step"><span className="step-number">1</span><b>Выберите услугу</b><p>Из прайса.</p></div>
            <div className="step"><span className="step-number">2</span><b>Выберите дату и время</b><p>Только свободные окна.</p></div>
            <div className="step"><span className="step-number">3</span><b>Отправьте заявку</b><p>Место закрепится за вами.</p></div>
          </div>
        </article>
        <article className="card" id="price">
          <h2>Прайс</h2>
          <div className="grid">
            {services.slice(0, 3).map((service) => <p key={service.id}>{service.title} — {rub(service.price)}</p>)}
            {services.length === 0 ? <p>Прайс пока пуст.</p> : null}
          </div>
          <a className="button secondary client-same-note" href={`/price?client=${token}`}>Весь прайс</a>
        </article>
      </section>

      <section className="card" id="waitlist">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Нет подходящего времени?</h2>
            <p>Встаньте в лист ожидания — мастер увидит пожелания.</p>
          </div>
        </div>
        <form action={joinWaitlist} className="grid" style={{ marginTop: 16 }}>
          <input type="hidden" name="clientToken" value={token} />
          <select name="waitMode" defaultValue="NEAREST">
            <option value="NEAREST">Ближайшее окно</option>
            <option value="DATES">Конкретные даты</option>
          </select>
          <div className="time-pills">
            {dateOptions(14).map((date) => <label key={date.value} style={{ width: "auto" }}><input type="checkbox" name="desiredDates" value={date.value} /> {date.label}</label>)}
          </div>
          <textarea name="note" placeholder="Например: могу после 15:00 / только выходные / срочно" />
          <button type="submit">Отправить пожелания</button>
        </form>
      </section>
    </main>
  );
}
