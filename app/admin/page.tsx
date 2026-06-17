import { approveClient, closeWaitlistEntry, rejectClient, setBookingStatus } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function fmtTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function fmtShortDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date);
}

function fmtDayTitle(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function statusText(status: string) {
  if (status === "PENDING") return "Ожидает";
  if (status === "CONFIRMED") return "Подтверждена";
  if (status === "COMPLETED") return "Завершена";
  if (status === "REJECTED") return "Отклонена";
  return status;
}

function statusClass(status: string) {
  if (status === "PENDING") return "admin-status wait";
  if (status === "CONFIRMED") return "admin-status ok";
  if (status === "COMPLETED") return "admin-status done";
  return "admin-status";
}

function parseWaitDates(value: string | null | undefined) {
  try {
    const dates = JSON.parse(value || "[]") as string[];
    return dates.filter(Boolean);
  } catch {
    return [];
  }
}

function waitModeText(mode: string) {
  return mode === "DATES" ? "Конкретные даты" : "Ближайшее окно";
}

function Sidebar({ requestCount, waitlistCount }: { requestCount: number; waitlistCount: number }) {
  const items = [
    ["Главная", "/admin", "⌂", ""],
    ["Записи", "/admin/bookings", "□", ""],
    ["Клиенты", "/admin/my-clients", "◇", ""],
    ["Расписание", "/admin/schedule", "▣", ""],
    ["Прайс", "/admin/services", "₽", ""],
    ["Услуги", "/admin/services", "✎", ""],
    ["Заявки", "/admin/requests", "!", String(requestCount || "")],
    ["Ждуны", "/admin#waitlist", "◷", String(waitlistCount || "")],
    ["Профиль", "/admin/profile", "◎", ""]
  ];

  return (
    <aside className="master-sidebar">
      <a className="master-brand" href="/admin">
        <span className="master-brand-icon">O</span>
        <span><b>Онлайн-запись</b><small>кабинет мастера</small></span>
      </a>

      <nav className="master-nav" aria-label="Меню мастера">
        {items.map(([label, href, icon, badge]) => (
          <a key={label} href={href} className={label === "Главная" ? "active" : ""}>
            <span>{icon}</span>
            <b>{label}</b>
            {badge ? <em>{badge}</em> : null}
          </a>
        ))}
      </nav>

      <div className="master-profile-mini">
        <span>М</span>
        <div><b>Мастер</b><small>администратор</small></div>
      </div>

      <a className="master-logout" href="/admin/logout">Выйти</a>
    </aside>
  );
}

function BookingList({ title, subtitle, bookings, actionHref }: { title: string; subtitle: string; bookings: any[]; actionHref: string }) {
  return (
    <article className="admin-home-panel">
      <div className="admin-panel-head">
        <div><h2>{title}</h2><p>{subtitle}</p></div>
        <a className="button secondary" href={actionHref}>Расписание</a>
      </div>

      <div className="admin-row-list">
        {bookings.map((booking) => (
          <div className="admin-booking-row" key={booking.id}>
            <time>{fmtTime(booking.startAt)}</time>
            <div>
              <b>{booking.client.lastName} {booking.client.firstName}</b>
              <small>{booking.service.title}</small>
            </div>
            <span className={statusClass(booking.status)}>{statusText(booking.status)}</span>
          </div>
        ))}
        {bookings.length === 0 ? <div className="admin-empty">Записей нет. Редкий подарок расписанию.</div> : null}
      </div>
    </article>
  );
}

export default async function AdminPage() {
  if (!isAdmin()) redirect("/admin/login");

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const tomorrowStart = startOfDay(tomorrow);
  const tomorrowEnd = endOfDay(tomorrow);
  const horizon = addDays(today, 21);

  const [
    pendingClients,
    pendingBookings,
    activeClients,
    waitlist,
    todayBookings,
    tomorrowBookings,
    onlineWindows,
    busyBookings
  ] = await Promise.all([
    prisma.client.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 4 }),
    prisma.booking.findMany({ where: { status: "PENDING" }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 4 }),
    prisma.client.count({ where: { status: "APPROVED" } }),
    prisma.waitlistEntry.findMany({ where: { status: "ACTIVE" }, include: { client: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.booking.findMany({
      where: { startAt: { gte: todayStart, lte: todayEnd }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
      take: 7
    }),
    prisma.booking.findMany({
      where: { startAt: { gte: tomorrowStart, lte: tomorrowEnd }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
      take: 7
    }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: today, lt: horizon } }, orderBy: { startAt: "asc" }, take: 40 }),
    prisma.booking.findMany({ where: { startAt: { gte: today, lt: horizon }, status: { in: ["PENDING", "CONFIRMED"] } }, select: { startAt: true } })
  ]);

  const requestCount = pendingClients.length + pendingBookings.length;
  const busySet = new Set(busyBookings.map((booking) => booking.startAt.toISOString()));
  const freeWindows = onlineWindows.filter((window) => !busySet.has(window.startAt.toISOString())).slice(0, 7);

  return (
    <main className="master-dashboard">
      <Sidebar requestCount={requestCount} waitlistCount={waitlist.length} />

      <section className="master-main admin-workdesk">
        <header className="admin-home-header">
          <div>
            <p className="eyebrow">Кабинет мастера</p>
            <h1>Главная</h1>
            <p>Сегодня, завтра, заявки, ждуны и ближайшие свободные окна. Без лишней гирлянды.</p>
          </div>
          <a className="button" href="/admin/manage">Новая запись</a>
        </header>

        <section className="admin-summary-grid" id="analytics">
          <div className="admin-summary-card"><b>{todayBookings.length}</b><span>сегодня</span></div>
          <div className="admin-summary-card"><b>{tomorrowBookings.length}</b><span>завтра</span></div>
          <div className="admin-summary-card"><b>{requestCount}</b><span>заявки</span></div>
          <div className="admin-summary-card"><b>{waitlist.length}</b><span>ждуны</span></div>
          <div className="admin-summary-card"><b>{activeClients}</b><span>клиенты</span></div>
        </section>

        <section className="admin-main-grid">
          <div className="admin-stack">
            <BookingList title="Сегодня" subtitle={fmtDayTitle(today)} bookings={todayBookings} actionHref="/admin/schedule" />
            <BookingList title="Завтра" subtitle={fmtDayTitle(tomorrow)} bookings={tomorrowBookings} actionHref="/admin/schedule" />
          </div>

          <div className="admin-stack">
            <article className="admin-home-panel">
              <div className="admin-panel-head">
                <div><h2>Заявки</h2><p>Что ждёт решения</p></div>
                <a className="button secondary" href="/admin/requests">Все заявки</a>
              </div>

              <div className="admin-row-list">
                {pendingClients.map((client) => (
                  <div className="admin-request-row" key={client.id}>
                    <div className="admin-request-main">
                      <b>{client.lastName} {client.firstName}</b>
                      <small>Новый клиент · {client.phone}</small>
                    </div>
                    <div className="admin-request-actions">
                      <form action={approveClient}>
                        <input type="hidden" name="id" value={client.id} />
                        <input type="hidden" name="redirectTo" value="/admin" />
                        <button type="submit">Подтвердить</button>
                      </form>
                      <form action={rejectClient}>
                        <input type="hidden" name="id" value={client.id} />
                        <input type="hidden" name="redirectTo" value="/admin" />
                        <button type="submit" className="danger">Отклонить</button>
                      </form>
                    </div>
                  </div>
                ))}

                {pendingBookings.map((booking) => (
                  <div className="admin-request-row" key={booking.id}>
                    <div className="admin-request-main">
                      <b>{fmtShortDate(booking.startAt)}, {fmtTime(booking.startAt)}</b>
                      <small>{booking.client.lastName} {booking.client.firstName} · {booking.service.title}</small>
                    </div>
                    <div className="admin-request-actions">
                      <form action={setBookingStatus}>
                        <input type="hidden" name="id" value={booking.id} />
                        <input type="hidden" name="status" value="CONFIRMED" />
                        <input type="hidden" name="redirectTo" value="/admin" />
                        <button type="submit">Подтвердить</button>
                      </form>
                      <form action={setBookingStatus}>
                        <input type="hidden" name="id" value={booking.id} />
                        <input type="hidden" name="status" value="REJECTED" />
                        <input type="hidden" name="redirectTo" value="/admin" />
                        <button type="submit" className="danger">Отклонить</button>
                      </form>
                    </div>
                  </div>
                ))}

                {requestCount === 0 ? <div className="admin-empty">Новых заявок нет. Подозрительно тихо, но приятно.</div> : null}
              </div>
            </article>

            <article className="admin-home-panel" id="waitlist">
              <div className="admin-panel-head">
                <div><h2>Ждуны</h2><p>Кто ждёт окно</p></div>
                <span className="badge">{waitlist.length}</span>
              </div>

              <div className="admin-row-list">
                {waitlist.map((entry) => {
                  const dates = parseWaitDates(entry.desiredDates);
                  return (
                    <div className="admin-wait-row" key={entry.id}>
                      <b>{entry.client.lastName} {entry.client.firstName}</b>
                      <small>{waitModeText(entry.mode)}</small>
                      {dates.length ? <div className="admin-wait-dates">{dates.map((date) => <span key={date}>{new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")}</span>)}</div> : null}
                      {entry.note ? <small>{entry.note}</small> : null}
                      <form action={closeWaitlistEntry}>
                        <input type="hidden" name="id" value={entry.id} />
                        <button type="submit" className="secondary">Убрать</button>
                      </form>
                    </div>
                  );
                })}
                {waitlist.length === 0 ? <div className="admin-empty">Лист ожидания пуст.</div> : null}
              </div>
            </article>
          </div>
        </section>

        <section className="admin-home-panel">
          <div className="admin-panel-head">
            <div><h2>Ближайшие свободные окна</h2><p>Свободное время, которое можно занять</p></div>
            <div className="actions">
              <a className="button secondary" href="/admin/schedule">Открыть расписание</a>
              <a className="button" href="/admin/schedule/free">Редактировать окна</a>
            </div>
          </div>

          <div className="admin-row-list">
            {freeWindows.map((window) => (
              <div className="admin-window-row" key={window.id}>
                <time>{fmtTime(window.startAt)}</time>
                <b>{fmtDayTitle(window.startAt)}</b>
                <a className="button secondary" href="/admin/manage">Записать</a>
              </div>
            ))}
            {freeWindows.length === 0 ? <div className="admin-empty">Ближайших свободных окон нет.</div> : null}
          </div>
        </section>
      </section>
    </main>
  );
}
