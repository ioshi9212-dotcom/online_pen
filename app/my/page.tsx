import { cancelClientBooking, cancelWaitlistEntry, joinWaitlist } from "@/app/actions";
import ClientBookingPicker from "@/app/ClientBookingPicker";
import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";
import { getClientCookie } from "@/lib/clientSession";
import { businessDateKey, formatInBusinessTime } from "@/lib/timezone";
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

function upperFirst(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function fmtDate(date: Date) {
  return upperFirst(formatInBusinessTime(date, { day: "numeric", month: "long", weekday: "long" }));
}

function fmtTime(date: Date) {
  return formatInBusinessTime(date, { hour: "2-digit", minute: "2-digit" });
}

function dayKey(date: Date) {
  return businessDateKey(date);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

function noticeText(searchParams: SearchParams) {
  if (searchParams.created) return "Заявка отправлена. Окно занято за вами, ждите подтверждения мастера.";
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
  if (status === "CONFIRMED") return "Подтверждено";
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
    return `Выбранные даты: ${dates.map((date) => new Date(`${date}T00:00:00`)).map((date) => formatInBusinessTime(date, { day: "2-digit", month: "2-digit", year: "numeric" })).join(", ")}`;
  }
  if (entry.mode === "DATES") return "Конкретные даты пока не выбраны.";
  return "Мастер увидит, что вы готовы прийти в ближайшее освободившееся окно.";
}

export default async function MyPage({ searchParams }: { searchParams: SearchParams }) {
  const token = searchParams.client || getClientCookie();
  if (!token) redirect("/login");
  if (!searchParams.client) redirect(`/my?client=${token}`);

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
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gte: new Date() } }, include: { service: true } })
  ]);

  const windows = onlineWindows.map((window) => {
    const fallbackEndAt = new Date(window.startAt.getTime() + 30 * 60_000);
    const busy = busyBookings.some((booking) => overlaps(window.startAt, fallbackEndAt, booking.startAt, booking.endAt));
    return {
      id: window.id,
      startAt: window.startAt.toISOString(),
      busy
    };
  });

  const firstFreeWindow = windows.find((window) => !window.busy);
  const firstAvailableDate = firstFreeWindow ? dayKey(new Date(firstFreeWindow.startAt)) : dayKey(new Date());
  const initialDate = searchParams.date || firstAvailableDate;
  const initialTime = "";
  const activeBookings = client.bookings.filter((booking) => ["PENDING", "CONFIRMED"].includes(booking.status));
  const pastBookings = client.bookings.filter((booking) => !["PENDING", "CONFIRMED"].includes(booking.status));
  const note = noticeText(searchParams);

  return (
    <main className="page client-page client-page-compact">
      <style jsx global>{`
        .client-page-compact #windows .calendar-card h2 {
          font-size: clamp(22px, 6vw, 30px) !important;
          line-height: 1 !important;
          max-width: 280px !important;
        }

        .client-page-compact .instruction-cards .info-card p {
          font-size: 12.5px !important;
          line-height: 1.25 !important;
        }

        .client-page-compact .calendar-legend .blue-dot,
        .client-page-compact .calendar-grid .day-btn .day-dots .blue-dot {
          background: var(--beauty-rose, #be6386) !important;
        }

        .client-collapse-card {
          padding: 0 !important;
          overflow: hidden !important;
        }

        .client-collapse-summary {
          list-style: none !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 14px !important;
          padding: 17px 20px !important;
        }

        .client-collapse-summary::-webkit-details-marker {
          display: none !important;
        }

        .client-collapse-summary span {
          display: grid !important;
          gap: 4px !important;
          min-width: 0 !important;
        }

        .client-collapse-summary small {
          color: var(--beauty-muted, #6f6570) !important;
          font-size: 12px !important;
          line-height: 1.1 !important;
        }

        .client-collapse-summary h2 {
          margin: 0 !important;
          font-size: clamp(27px, 7vw, 40px) !important;
          line-height: 1 !important;
        }

        .client-collapse-summary i {
          width: 34px !important;
          height: 34px !important;
          min-width: 34px !important;
          border-radius: 999px !important;
          display: grid !important;
          place-items: center !important;
          border: 1px solid rgba(128, 59, 88, .16) !important;
          color: #8a3e5e !important;
          background: rgba(255,255,255,.72) !important;
          font-style: normal !important;
          font-size: 22px !important;
          transition: transform .18s ease !important;
        }

        .client-collapse-card[open] .client-collapse-summary i {
          transform: rotate(180deg) !important;
        }

        .client-collapse-body {
          padding: 0 20px 20px !important;
        }

        .waitlist-compact-form {
          gap: 10px !important;
        }

        .waitlist-compact-form label {
          gap: 5px !important;
          font-size: 13px !important;
        }

        .waitlist-compact-form input,
        .waitlist-compact-form select,
        .waitlist-compact-form textarea {
          min-height: 40px !important;
          border-radius: 11px !important;
          padding: 9px 11px !important;
          font-size: 14px !important;
        }

        .waitlist-compact-form textarea {
          min-height: 72px !important;
        }

        .waitlist-compact-form button {
          min-height: 40px !important;
          border-radius: 12px !important;
          padding: 9px 14px !important;
        }

        .waitlist-active-list {
          margin-top: 12px !important;
          gap: 8px !important;
        }

        .waitlist-active-list .mini-card {
          padding: 12px !important;
          border-radius: 13px !important;
        }

        .waitlist-active-list h3 {
          margin: 0 !important;
          font-size: 15px !important;
          line-height: 1.15 !important;
        }

        .waitlist-active-list p {
          margin: 5px 0 0 !important;
          font-size: 12.5px !important;
          line-height: 1.25 !important;
        }

        .waitlist-active-list button {
          min-height: 34px !important;
          border-radius: 10px !important;
          padding: 7px 10px !important;
          font-size: 12px !important;
        }

        .price-compact-card {
          padding: 18px 20px !important;
        }

        .price-compact-card h2 {
          margin: 0 0 12px !important;
          font-size: clamp(30px, 8vw, 46px) !important;
          line-height: 1 !important;
        }

        .price-list.price-compact-list {
          display: grid !important;
          gap: 8px !important;
        }

        .price-list.price-compact-list .price-row {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) auto !important;
          align-items: center !important;
          gap: 12px !important;
          padding: 10px 0 !important;
          border-bottom: 1px solid rgba(128, 59, 88, .11) !important;
        }

        .price-list.price-compact-list .price-row:last-child {
          border-bottom: 0 !important;
        }

        .price-list.price-compact-list .price-row b {
          display: block !important;
          font-size: 16px !important;
          line-height: 1.15 !important;
          font-weight: 800 !important;
        }

        .price-list.price-compact-list .price-row p {
          margin: 4px 0 0 !important;
          font-size: 12.5px !important;
          line-height: 1.25 !important;
        }

        .price-list.price-compact-list .price-row strong {
          font-size: 17px !important;
          line-height: 1 !important;
          white-space: nowrap !important;
          color: var(--beauty-rose-dark, #803b58) !important;
        }

        .history-compact-list {
          display: grid !important;
          gap: 7px !important;
        }

        .history-compact-list p {
          margin: 0 !important;
          padding: 8px 0 !important;
          border-bottom: 1px solid rgba(128, 59, 88, .11) !important;
          font-size: 13px !important;
          line-height: 1.3 !important;
        }

        .history-compact-list p:last-child {
          border-bottom: 0 !important;
        }

        @media (max-width: 760px) {
          .client-collapse-summary,
          .client-collapse-body,
          .price-compact-card {
            padding-left: 18px !important;
            padding-right: 18px !important;
          }

          .price-list.price-compact-list .price-row {
            grid-template-columns: minmax(0, 1fr) auto !important;
          }
        }
      `}</style>

      {note ? <div className={searchParams.busy || searchParams.bookingError ? "notice danger-notice" : "notice ok-status"}>{note}</div> : null}

      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>Свободные окна и запись</h1>
        <p className="lead">{client.firstName}, выберите дату, одну основную услугу и время. Допы можно написать в комментарии.</p>
      </section>

      <section className="info-cards instruction-cards">
        <article className="info-card"><h3>1. Календарь</h3><p>Серые числа — день недоступен. Белые — можно открыть. Розовая точка — есть свободное место, серая — часть времени уже занята.</p></article>
        <article className="info-card"><h3>2. Услуга</h3><p>Сначала выберите услугу. После кнопки «Выбрать услугу» появится свободное время для этой даты.</p></article>
        <article className="info-card"><h3>3. Заявка</h3><p>Выберите время, проверьте свои данные и отправьте заявку. Окно займётся за вами до ответа мастера.</p></article>
      </section>

      <ClientBookingPicker
        token={token}
        client={{ firstName: client.firstName, lastName: client.lastName, phone: client.phone }}
        services={bookableServices.map((service) => ({ id: service.id, title: service.title, price: service.price, durationMinutes: service.durationMinutes, description: service.description }))}
        windows={windows}
        initialDate={initialDate}
        initialTime={initialTime}
      />

      <section className="card" id="bookings">
        <h2>Мои записи</h2>
        {activeBookings.length === 0 ? <div className="empty-state">Активных записей пока нет.</div> : (
          <div className="grid">
            {activeBookings.map((booking) => (
              <article className="booking-card" key={booking.id}>
                <div><h3>{booking.service.title}</h3><p>{fmtDate(booking.startAt)} в {fmtTime(booking.startAt)}</p></div>
                <span className={statusClass(booking.status)}>{statusText(booking.status)}</span>
                <form action={cancelClientBooking}>
                  <input type="hidden" name="clientToken" value={token} />
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <button className="secondary" type="submit">Отменить запись</button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <details className="card client-collapse-card" id="waitlist">
        <summary className="client-collapse-summary">
          <span>
            <small>{client.waitlist.length ? `${client.waitlist.length} активн.` : "если нужное время занято"}</small>
            <h2>Лист ожидания</h2>
          </span>
          <i aria-hidden="true">⌄</i>
        </summary>
        <div className="client-collapse-body">
          <form action={joinWaitlist} className="grid waitlist-compact-form">
            <input type="hidden" name="clientToken" value={token} />
            <label>Как искать окно<select name="waitMode"><option value="NEAREST">Ближайшее свободное</option><option value="DATES">Конкретные даты</option></select></label>
            <label>Даты, если нужны конкретные<input name="desiredDates" type="date" /></label>
            <label>Комментарий<textarea name="note" placeholder="Например: могу после 16:00, кроме пятницы" /></label>
            <button type="submit">Встать в лист ожидания</button>
          </form>

          {client.waitlist.length ? (
            <div className="grid waitlist-active-list">
              {client.waitlist.map((entry) => (
                <article className="mini-card" key={entry.id}>
                  <h3>{waitlistTitle(entry)}</h3>
                  <p>{waitlistDescription(entry)}</p>
                  {entry.note ? <p className="muted">Комментарий: {entry.note}</p> : null}
                  <form action={cancelWaitlistEntry}>
                    <input type="hidden" name="clientToken" value={token} />
                    <input type="hidden" name="waitlistId" value={entry.id} />
                    <button className="secondary" type="submit">Убрать из ожидания</button>
                  </form>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </details>

      <section className="card price-compact-card" id="price">
        <h2>Прайс</h2>
        <div className="price-list price-compact-list">
          {priceServices.map((service) => (
            <article className="price-row" key={service.id}>
              <div><b>{service.title}</b>{service.description ? <p>{service.description}</p> : null}</div>
              <strong>{rub(service.price)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="card" id="profile">
        <h2>Профиль</h2>
        <p>{client.firstName} {client.lastName}</p>
        <p>{client.phone}</p>
        <a className="button secondary" href={`/profile?client=${token}`}>Редактировать профиль</a>
      </section>

      {pastBookings.length ? (
        <details className="card client-collapse-card" id="history">
          <summary className="client-collapse-summary">
            <span>
              <small>{pastBookings.length} записей</small>
              <h2>История</h2>
            </span>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="client-collapse-body history-compact-list">
            {pastBookings.slice(0, 8).map((booking) => <p key={booking.id}>{fmtDate(booking.startAt)} — {booking.service.title} — {statusText(booking.status)}</p>)}
          </div>
        </details>
      ) : null}
    </main>
  );
}