import { cancelClientBooking, createBooking, joinWaitlist } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  client?: string;
  date?: string;
  time?: string;
  created?: string;
  waitlist?: string;
  cancelled?: string;
  login?: string;
  known?: string;
  busy?: string;
  bookingError?: string;
};

type OnlineWindowItem = {
  id: string;
  startAt: Date;
};

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(date);
}

function fmtShortDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", weekday: "short" }).format(date);
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
    result.push({ value: dayKey(date), label: fmtShortDate(date) });
  }
  return result;
}

function noticeText(searchParams: SearchParams) {
  if (searchParams.created) return "Заявка отправлена. Окно уже закреплено за вами.";
  if (searchParams.waitlist) return "Вы в листе ожидания. Мастер увидит пожелания.";
  if (searchParams.cancelled) return "Запись отменена.";
  if (searchParams.login) return "Вход выполнен.";
  if (searchParams.known) return "Вы уже есть в базе. Можно записываться.";
  if (searchParams.busy) return "Это окно уже заняли или оно не подходит по длительности. Выберите другое.";
  if (searchParams.bookingError === "service") return "Выберите услугу.";
  return "";
}

function waitlistText(entry: { mode: string; desiredDates: string }) {
  if (entry.mode === "DATES") {
    try {
      const dates = JSON.parse(entry.desiredDates || "[]") as string[];
      if (dates.length) return `Желаемые даты: ${dates.map((date) => new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")).join(", ")}`;
    } catch {}
  }
  return "Ищет ближайшее свободное окно";
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
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 120 }),
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
  const selectedTime = searchParams.time || "";
  const selectedWindow = selectedWindows.find((window) => window.startAt.toISOString() === selectedTime && !busyStartSet.has(window.startAt.toISOString()));
  const monthBase = selectedWindows[0]?.startAt || selectedDate;
  const activeBookings = client.bookings.filter((booking) => ["PENDING", "CONFIRMED"].includes(booking.status));
  const pastBookings = client.bookings.filter((booking) => !["PENDING", "CONFIRMED"].includes(booking.status));
  const note = noticeText(searchParams);
  const monthDays = Array.from({ length: daysInMonth(monthBase) }, (_, index) => index + 1);
  const dates = dateOptions(21);

  return (
    <main className="page client-page">
      {note ? <div className={searchParams.busy || searchParams.bookingError ? "notice danger-notice" : "notice ok-status"}>{note}</div> : null}

      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>Свободные окна и запись</h1>
        <p className="lead">{client.firstName}, всё собирается на этой странице: дата, время, услуга и отправка заявки.</p>
      </section>

      <section className="info-cards">
        <article className="info-card">
          <h3>1. Выберите дату</h3>
          <p>Календарь остаётся на месте. Даты с точкой — есть открытые окна.</p>
          <a className="button" href="#windows">К календарю</a>
        </article>
        <article className="info-card">
          <h3>2. Выберите время</h3>
          <p>Справа появится список времени. Занятое видно, но нажать нельзя.</p>
          <a className="button secondary" href="#selected-day">К времени</a>
        </article>
        <article className="info-card">
          <h3>3. Соберите запись</h3>
          <p>Ниже выберите одну услугу, комментарий и отправьте заявку.</p>
          <a className="button secondary" href="#booking-builder">К сборке</a>
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

        <article className="selected-day-card card" id="selected-day">
          <p className="muted">Выбранная дата</p>
          <h2>{fmtDate(selectedDate)}</h2>
          <p>{selectedBusyCount} занято · {selectedFreeCount} свободно</p>
          <div className="time-grid">
            {selectedWindows.map((window) => {
              const isBusy = busyStartSet.has(window.startAt.toISOString());
              const active = selectedTime === window.startAt.toISOString();
              return isBusy ? (
                <span key={window.id} className="time-btn busy" aria-disabled="true"><b>{fmtTime(window.startAt)}</b><span>Занято</span></span>
              ) : (
                <a key={window.id} className={active ? "time-btn free active" : "time-btn free"} href={`/my?client=${token}&date=${selectedDateKey}&time=${encodeURIComponent(window.startAt.toISOString())}#booking-builder`}><b>{fmtTime(window.startAt)}</b><span>Свободно</span></a>
              );
            })}
            {selectedWindows.length === 0 ? <div className="empty-state"><p>На эту дату открытых окон нет.</p></div> : null}
          </div>
        </article>
      </section>

      <section className="card booking-builder" id="booking-builder">
        <div className="section-head">
          <div>
            <p className="muted">Сборка записи</p>
            <h2>Дата, время, услуга и отправка</h2>
            <p>Выберите время выше — здесь появится форма записи. На одно окно можно выбрать только одну услугу.</p>
          </div>
          {selectedWindow ? <span className="status ok">{fmtDate(selectedWindow.startAt)}, {fmtTime(selectedWindow.startAt)}</span> : <span className="status">Время не выбрано</span>}
        </div>

        {selectedWindow ? (
          <form action={createBooking} className="booking-builder-form">
            <input type="hidden" name="clientToken" value={token} />
            <input type="hidden" name="startAt" value={selectedWindow.startAt.toISOString()} />
            <input type="hidden" name="returnDate" value={selectedDateKey} />
            <input type="hidden" name="returnTime" value={selectedWindow.startAt.toISOString()} />

            <div className="booking-summary-row">
              <div><span>Дата</span><b>{fmtDate(selectedWindow.startAt)}</b></div>
              <div><span>Время</span><b>{fmtTime(selectedWindow.startAt)}</b></div>
              <div><span>Клиент</span><b>{client.firstName} {client.lastName}</b></div>
              <div><span>Телефон</span><b>{client.phone}</b></div>
            </div>

            <div>
              <h3>Услуга</h3>
              <p className="muted">Выберите одну процедуру для этого времени. Если нужна ещё одна услуга — запишитесь на отдельное свободное окно после этой записи.</p>
              <div className="service-check-grid">
                {services.map((service, index) => (
                  <label className="service-check" key={service.id}>
                    <input type="radio" name="serviceId" value={service.id} defaultChecked={index === 0} />
                    <span><b>{service.title}</b><small>{service.durationMinutes} мин · {rub(service.price)}</small></span>
                  </label>
                ))}
              </div>
              {services.length === 0 ? <div className="notice">Прайс пока пуст. Записаться нельзя.</div> : null}
              {services.length > 1 ? <p className="muted">Для второй процедуры выберите следующее свободное время отдельной заявкой.</p> : null}
            </div>

            <label>Комментарий к записи<textarea name="comment" placeholder="Например: хочу френч / ремонт ногтя / дизайн / есть ограничение по времени" /></label>

            <div className="confirm-box">
              <h3>Проверка</h3>
              <p>После отправки окно закрепится за вами, а мастер увидит заявку. Статус появится ниже в блоке “Ваши записи”.</p>
              <button type="submit">Отправить заявку</button>
            </div>
          </form>
        ) : (
          <div className="empty-state">
            <h3>Выберите время справа</h3>
            <p>После выбора времени здесь появится список услуг, комментарий и кнопка отправки.</p>
          </div>
        )}
      </section>

      <section className="card current-booking-card" id="my-booking">
        <div className="section-head">
          <div>
            <h2>Ваши записи</h2>
            <p>Здесь появится отправленная заявка и её статус: ожидает, подтверждена или отклонена.</p>
          </div>
          <a className="button secondary" href="#windows">Выбрать ещё окно</a>
        </div>
        {activeBookings.length ? (
          <div className="booking-status-list">
            {activeBookings.map((booking) => (
              <article className="booking-status-card" key={booking.id}>
                <div>
                  <b>{fmtDate(booking.startAt)}, {fmtTime(booking.startAt)}</b>
                  <p>{booking.service.title} · {rub(booking.finalPrice ?? booking.service.price)}</p>
                  <span className={statusClass(booking.status)}>{statusText(booking.status)}</span>
                  {booking.status === "PENDING" ? <p className="pending-booking-text">Окно уже закреплено за вами. Осталось дождаться подтверждения мастера.</p> : null}
                  {booking.clientComment ? <small>{booking.clientComment}</small> : null}
                </div>
                <details>
                  <summary className="button secondary">Отменить</summary>
                  <form action={cancelClientBooking} className="grid" style={{ marginTop: 12 }}>
                    <input type="hidden" name="clientToken" value={token} />
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button type="submit" className="danger">Да, отменить</button>
                  </form>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <p>Активной записи нет. Выберите дату и время выше.</p>
        )}
      </section>

      <section className="top-split" id="how">
        <article className="card">
          <h2>Пошагово</h2>
          <div className="steps">
            <div className="step"><span className="step-number">1</span><b>Дата</b><p>Выберите день в календаре.</p></div>
            <div className="step"><span className="step-number">2</span><b>Время</b><p>Выберите свободное окно справа.</p></div>
            <div className="step"><span className="step-number">3</span><b>Услуга</b><p>Выберите одну процедуру.</p></div>
          </div>
        </article>
        <article className="card" id="price">
          <h2>Прайс</h2>
          <div className="grid">
            {services.slice(0, 3).map((service) => <p key={service.id}>{service.title} — {rub(service.price)}</p>)}
            {services.length === 0 ? <p>Прайс пока пуст.</p> : null}
          </div>
          <a className="button secondary" href={`/price?client=${token}`}>Весь прайс</a>
        </article>
      </section>

      <section className="card" id="waitlist">
        <div className="section-head">
          <div>
            <h2>Лист ожидания</h2>
            <p>Если подходящего времени нет — оставьте пожелания.</p>
          </div>
          {client.waitlist.length ? <span className="status wait">уже в списке</span> : null}
        </div>

        {client.waitlist.length ? <div className="notice">{client.waitlist.map((entry) => <p key={entry.id}>{waitlistText(entry)}</p>)}</div> : null}

        <details open={client.waitlist.length === 0}>
          <summary className="button secondary">Встать в лист ожидания</summary>
          <form action={joinWaitlist} className="grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="clientToken" value={token} />
            <div className="grid-2">
              <label><input type="radio" name="waitMode" value="NEAREST" defaultChecked />Ближайшее окно</label>
              <label><input type="radio" name="waitMode" value="DATES" />Конкретные даты</label>
            </div>
            <div className="date-pick-grid">
              {dates.map((date) => <label key={date.value} className="date-chip"><input type="checkbox" name="desiredDates" value={date.value} /><span>{date.label}</span></label>)}
            </div>
            <label>Комментарий<textarea name="note" placeholder="Например: могу после 15:00 / только выходные / срочно" /></label>
            <button type="submit">Отправить пожелания</button>
          </form>
        </details>
      </section>

      {pastBookings.length ? (
        <section className="card">
          <h2>История</h2>
          <div className="booking-status-list">
            {pastBookings.slice(0, 6).map((booking) => <article className="booking-status-card" key={booking.id}><b>{fmtDate(booking.startAt)}, {fmtTime(booking.startAt)}</b><p>{booking.service.title} · {rub(booking.finalPrice ?? booking.service.price)}</p><span className={statusClass(booking.status)}>{statusText(booking.status)}</span></article>)}
          </div>
        </section>
      ) : null}
    </main>
  );
}
