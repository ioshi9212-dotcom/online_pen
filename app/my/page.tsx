import { cancelClientBooking, cancelWaitlistEntry, joinWaitlist } from "@/app/actions";
import ClientBookingPicker from "@/app/ClientBookingPicker";
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

type WaitlistItem = { id: string; mode: string; desiredDates: string; note: string | null };

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(date);
}

function fmtShortDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", weekday: "short" }).format(date);
}

function fmtTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateOptions(days = 28) {
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
  if (searchParams.waitlist === "cancelled") return "Вы отменили лист ожидания.";
  if (searchParams.waitlist === "nearest") return "Заявка отправлена на ближайшее свободное окно. Мастер увидит ваше пожелание.";
  if (searchParams.waitlist === "dates") return "Заявка с выбранными датами отправлена. Мастер увидит ваши пожелания.";
  if (searchParams.cancelled) return "Запись отменена.";
  if (searchParams.login) return "Вход выполнен.";
  if (searchParams.known) return "Вы уже есть в базе. Можно записываться.";
  if (searchParams.busy) return "Это окно уже заняли или оно не подходит по длительности. Выберите другое.";
  if (searchParams.bookingError === "service") return "Выберите основную услугу, доступную для записи.";
  return "";
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

function waitlistDates(entry: WaitlistItem) {
  if (entry.mode !== "DATES") return [];
  try {
    return (JSON.parse(entry.desiredDates || "[]") as string[]).filter(Boolean);
  } catch {
    return [];
  }
}

function waitlistTitle(entry: WaitlistItem) {
  return entry.mode === "DATES" ? "Ожидание на конкретные даты" : "Ожидание ближайшего окна";
}

function waitlistDescription(entry: WaitlistItem) {
  const dates = waitlistDates(entry);
  if (entry.mode === "DATES" && dates.length) {
    return `Выбранные даты: ${dates.map((date) => new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")).join(", ")}`;
  }
  if (entry.mode === "DATES") return "Конкретные даты пока не выбраны.";
  return "Мастер увидит, что вы готовы прийти в ближайшее освободившееся окно.";
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

  const [bookableServices, priceServices, onlineWindows, busyBookings] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true, showInBooking: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 120 }),
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gte: new Date() } }, select: { startAt: true, endAt: true } })
  ]);

  const busyStartSet = new Set(busyBookings.map((booking) => booking.startAt.toISOString()));
  const windows = onlineWindows.map((window) => ({
    id: window.id,
    startAt: window.startAt.toISOString(),
    busy: busyStartSet.has(window.startAt.toISOString())
  }));
  const firstFreeWindow = windows.find((window) => !window.busy);
  const firstAvailableDate = firstFreeWindow ? dayKey(new Date(firstFreeWindow.startAt)) : dayKey(new Date());
  const initialDate = searchParams.date || firstAvailableDate;
  const initialTime = searchParams.time || firstFreeWindow?.startAt || "";
  const activeBookings = client.bookings.filter((booking) => ["PENDING", "CONFIRMED"].includes(booking.status));
  const pastBookings = client.bookings.filter((booking) => !["PENDING", "CONFIRMED"].includes(booking.status));
  const note = noticeText(searchParams);
  const dates = dateOptions(28);

  return (
    <main className="page client-page">
      {note ? <div className={searchParams.busy || searchParams.bookingError ? "notice danger-notice" : "notice ok-status"}>{note}</div> : null}

      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>Свободные окна и запись</h1>
        <p className="lead">{client.firstName}, выберите дату, время и одну основную услугу. Допы смотрите в прайсе.</p>
      </section>

      <section className="info-cards instruction-cards">
        <article className="info-card"><h3>1. Дата</h3><p>Даты с точкой — дни, где есть свободные окна.</p></article>
        <article className="info-card"><h3>2. Время</h3><p>Список свободных окон меняется справа без перезагрузки страницы.</p></article>
        <article className="info-card"><h3>3. Заявка</h3><p>Выберите одну основную услугу и отправьте запись мастеру.</p></article>
      </section>

      <ClientBookingPicker
        token={token}
        client={{ firstName: client.firstName, lastName: client.lastName, phone: client.phone }}
        windows={windows}
        services={bookableServices.map((service) => ({ id: service.id, title: service.title, durationMinutes: service.durationMinutes, price: service.price }))}
        initialDate={initialDate}
        initialTime={initialTime}
      />

      <section className="card current-booking-card" id="my-booking">
        <div className="section-head">
          <div><h2>Ваши записи</h2><p>Здесь появится отправленная заявка и её статус.</p></div>
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
        ) : <p>Активной записи нет. Выберите дату и время выше.</p>}
      </section>

      <section className="card price-preview-card" id="price">
        <div className="section-head">
          <div><h2>Прайс</h2><p>Основные услуги и допы. Допы не выбираются как отдельная запись.</p></div>
          <a className="button secondary" href={`/price?client=${token}`}>Весь прайс</a>
        </div>
        {priceServices.length ? (
          <div className="price-preview-grid">
            {priceServices.slice(0, 6).map((service) => (
              <article className="price-preview-item" key={service.id}>
                <div><h3>{service.title}</h3><p>{service.showInBooking ? "можно выбрать при записи" : "только в прайсе"}</p></div>
                <b>{rub(service.price)}</b>
              </article>
            ))}
          </div>
        ) : <div className="empty-state">Прайс пока пуст.</div>}
      </section>

      {client.waitlist.length ? (
        <div className="waitlist-status-strip">Статус ожидания: вы в листе ожидания. Мастер видит вашу заявку.</div>
      ) : null}

      <details className="card waitlist-big-card collapsed-client-section" id="waitlist">
        <summary className="collapsible-summary">
          <div><h2>Лист ожидания</h2><p>Оставьте заявку, если подходящего времени нет.</p></div>
          <div className="collapse-actions">
            {client.waitlist.length ? <span className="status wait">вы в списке</span> : null}
            <span className="toggle-label"><span className="closed-label">Развернуть⌄</span><span className="open-label">Свернуть⌃</span></span>
          </div>
        </summary>

        {client.waitlist.length ? (
          <div className="waitlist-current-list">
            {client.waitlist.map((entry) => (
              <article className="waitlist-current-card" key={entry.id}>
                <h3>{waitlistTitle(entry)}</h3>
                <p>{waitlistDescription(entry)}</p>
                {waitlistDates(entry).length ? <div className="chosen-date-list">{waitlistDates(entry).map((date) => <span key={date}>{new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")}</span>)}</div> : null}
                {entry.note ? <small>Комментарий: {entry.note}</small> : null}
                <details className="waitlist-cancel-box">
                  <summary className="button secondary">Отменить ожидание</summary>
                  <form action={cancelWaitlistEntry} className="grid" style={{ marginTop: 12 }}>
                    <input type="hidden" name="clientToken" value={token} />
                    <input type="hidden" name="waitlistId" value={entry.id} />
                    <p className="muted">Если передумали — уберём вас из листа ожидания. Мастер больше не увидит эту заявку.</p>
                    <button type="submit" className="danger">Да, убрать меня из ожидания</button>
                  </form>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="waitlist-empty-state"><h3>В листе ожидания вы не стоите</h3><p>Выберите вариант ниже. Мастер увидит заявку и сможет предложить время.</p></div>
        )}

        <div className="waitlist-choice-grid">
          <article className="waitlist-choice-card">
            <h3>Ближайшее окно</h3>
            <p>Подойдёт, если вы готовы прийти в любое ближайшее свободное время.</p>
            <form action={joinWaitlist} className="grid">
              <input type="hidden" name="clientToken" value={token} />
              <input type="hidden" name="waitMode" value="NEAREST" />
              <label>Комментарий<textarea name="note" placeholder="Например: могу после 15:00 / только выходные / срочно" /></label>
              <button type="submit">Ближайшее окно</button>
            </form>
          </article>

          <article className="waitlist-choice-card">
            <h3>Конкретные даты</h3>
            <p>Можно выбрать несколько дат. Нажатые даты подсветятся.</p>
            <form action={joinWaitlist} className="grid">
              <input type="hidden" name="clientToken" value={token} />
              <input type="hidden" name="waitMode" value="DATES" />
              <div className="waitlist-date-grid">{dates.map((date) => <label key={date.value} className="date-chip wait-date-chip"><input type="checkbox" name="desiredDates" value={date.value} /><span>{date.label}</span></label>)}</div>
              <label>Комментарий<textarea name="note" placeholder="Например: лучше вечером / эти даты свободна до 14:00" /></label>
              <button type="submit">Готово — отправить даты</button>
            </form>
          </article>
        </div>
      </details>

      {pastBookings.length ? (
        <details className="card collapsed-client-section history-section">
          <summary className="collapsible-summary">
            <div><h2>История</h2><p>Прошлые и отменённые записи.</p></div>
            <span className="toggle-label"><span className="closed-label">Развернуть⌄</span><span className="open-label">Свернуть⌃</span></span>
          </summary>
          <div className="booking-status-list">
            {pastBookings.slice(0, 6).map((booking) => <article className="booking-status-card" key={booking.id}><b>{fmtDate(booking.startAt)}, {fmtTime(booking.startAt)}</b><p>{booking.service.title} · {rub(booking.finalPrice ?? booking.service.price)}</p><span className={statusClass(booking.status)}>{statusText(booking.status)}</span></article>)}
          </div>
        </details>
      ) : null}
    </main>
  );
}
