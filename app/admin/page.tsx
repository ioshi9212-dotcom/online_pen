import { approveClient, closeWaitlistEntry, rejectClient, setBookingStatus } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { addBusinessDays, businessDateFromKey, businessDateKey, businessMonthKey, formatInBusinessTime } from "@/lib/timezone";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function upperFirst(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function fmtTime(date: Date) {
  return formatInBusinessTime(date, { hour: "2-digit", minute: "2-digit" });
}

function fmtShortDate(date: Date) {
  return formatInBusinessTime(date, { day: "numeric", month: "long" });
}

function fmtDayTitle(date: Date) {
  return formatInBusinessTime(date, { weekday: "long", day: "numeric", month: "long" });
}

function fmtTopDate(date: Date) {
  return formatInBusinessTime(date, { weekday: "long", day: "numeric", month: "long" });
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function durationText(startAt: Date, endAt: Date) {
  const total = Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60_000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours && minutes) return `${hours} ч ${minutes} мин`;
  if (hours) return `${hours} ч`;
  return `${minutes || 0} мин`;
}

function statusText(status: string) {
  if (status === "PENDING") return "Не подтверждено";
  if (status === "CONFIRMED") return "Предстоит";
  if (status === "COMPLETED") return "Завершена";
  if (status === "CANCELLED_BY_CLIENT") return "Клиент отменил";
  if (status === "CANCELLED_BY_ADMIN") return "Отменено";
  if (status === "REJECTED") return "Отклонена";
  if (status === "NO_SHOW") return "Не пришла";
  return status;
}

function statusClass(status: string) {
  if (status === "PENDING") return "admin-status wait";
  if (status === "CONFIRMED") return "admin-status ok";
  if (status === "COMPLETED") return "admin-status done";
  if (["CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "NO_SHOW"].includes(status)) return "admin-status muted";
  return "admin-status";
}

function mobileStatusClass(status: string) {
  if (status === "PENDING") return "mobile-master-status wait";
  if (status === "CONFIRMED") return "mobile-master-status ok";
  if (status === "COMPLETED") return "mobile-master-status done";
  if (["CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "NO_SHOW"].includes(status)) return "mobile-master-status muted";
  return "mobile-master-status";
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

function scheduleHref(date: Date) {
  const key = businessDateKey(date);
  return `/admin/schedule?view=calendar&month=${businessMonthKey(date)}&date=${key}#selected-day`;
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

function MobileBookingCard({ title, date, bookings }: { title: string; date: Date; bookings: any[] }) {
  return (
    <article className="mobile-master-panel">
      <div className="mobile-master-panel-head">
        <div className="mobile-master-title-row">
          <h2>{title}</h2>
          <span>{bookings.length}</span>
        </div>
        <p>{fmtDayTitle(date)}</p>
      </div>

      <div className="mobile-master-list">
        {bookings.map((booking) => (
          <a className="mobile-master-booking" href={scheduleHref(booking.startAt)} key={booking.id}>
            <div className="mobile-master-time">
              <b>{fmtTime(booking.startAt)}</b>
              <small>{durationText(booking.startAt, booking.endAt)}</small>
            </div>
            <div className="mobile-master-booking-main">
              <b>{booking.client.lastName} {booking.client.firstName}</b>
              <small>{booking.service.title}</small>
            </div>
            <span className={mobileStatusClass(booking.status)}>{statusText(booking.status)}</span>
            <i aria-hidden="true">›</i>
          </a>
        ))}
        {bookings.length === 0 ? <div className="mobile-master-empty">Записей нет.</div> : null}
      </div>
    </article>
  );
}

function MobileRequestsPanel({ pendingClients, pendingBookings }: { pendingClients: any[]; pendingBookings: any[] }) {
  return (
    <section className="mobile-master-two-grid">
      <details className="mobile-master-mini-panel" open={pendingBookings.length > 0}>
        <summary><span>Заявки на запись</span><b>{pendingBookings.length}</b></summary>
        <div className="mobile-master-mini-list">
          {pendingBookings.map((booking) => (
            <div className="mobile-master-request" key={booking.id}>
              <div>
                <b>{fmtTime(booking.startAt)} · {booking.client.lastName} {booking.client.firstName}</b>
                <small>{booking.service.title}</small>
              </div>
              <div className="mobile-master-request-actions">
                <form action={setBookingStatus}>
                  <input type="hidden" name="id" value={booking.id} />
                  <input type="hidden" name="status" value="CONFIRMED" />
                  <input type="hidden" name="redirectTo" value="/admin" />
                  <button type="submit">Да</button>
                </form>
                <a href={scheduleHref(booking.startAt)} aria-label="Открыть заявку">›</a>
              </div>
            </div>
          ))}
          {pendingBookings.length === 0 ? <div className="mobile-master-empty">Новых заявок нет.</div> : null}
        </div>
      </details>

      <details className="mobile-master-mini-panel" open={pendingClients.length > 0}>
        <summary><span>Заявки на регистрацию</span><b>{pendingClients.length}</b></summary>
        <div className="mobile-master-mini-list">
          {pendingClients.map((client) => (
            <div className="mobile-master-request" key={client.id}>
              <div>
                <b>{client.lastName} {client.firstName}</b>
                <small>{client.phone}</small>
              </div>
              <div className="mobile-master-request-actions">
                <form action={approveClient}>
                  <input type="hidden" name="id" value={client.id} />
                  <input type="hidden" name="redirectTo" value="/admin" />
                  <button type="submit">Да</button>
                </form>
                <form action={rejectClient}>
                  <input type="hidden" name="id" value={client.id} />
                  <input type="hidden" name="redirectTo" value="/admin" />
                  <button type="submit" className="danger">Нет</button>
                </form>
              </div>
            </div>
          ))}
          {pendingClients.length === 0 ? <div className="mobile-master-empty">Новых регистраций нет.</div> : null}
        </div>
      </details>
    </section>
  );
}

function MobileWaitlistPanel({ waitlist }: { waitlist: any[] }) {
  return (
    <article className="mobile-master-panel" id="waitlist">
      <div className="mobile-master-panel-head">
        <div className="mobile-master-title-row">
          <h2>Ждуны</h2>
          <span>{waitlist.length}</span>
        </div>
        <p>{waitlist.length ? "Кто ждёт свободное окно" : "Лист ожидания пуст"}</p>
      </div>

      <div className="mobile-master-list">
        {waitlist.map((entry) => {
          const dates = parseWaitDates(entry.desiredDates);
          return (
            <div className="mobile-master-wait" key={entry.id}>
              <div>
                <b>{entry.client.lastName} {entry.client.firstName}</b>
                <small>{waitModeText(entry.mode)}{entry.note ? ` · ${entry.note}` : ""}</small>
                {dates.length ? <div className="mobile-master-date-chips">{dates.map((date) => <span key={date}>{new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")}</span>)}</div> : null}
              </div>
              <div className="mobile-master-wait-actions">
                <a href={`/admin/manage?clientId=${entry.client.id}`}>Записать</a>
                <form action={closeWaitlistEntry}>
                  <input type="hidden" name="id" value={entry.id} />
                  <button type="submit" className="secondary">Убрать</button>
                </form>
              </div>
            </div>
          );
        })}
        {waitlist.length === 0 ? <div className="mobile-master-empty">Ждунов нет.</div> : null}
      </div>
    </article>
  );
}

function MobileBottomNav() {
  return (
    <nav className="mobile-master-bottom-nav" aria-label="Быстрое меню мастера">
      <a className="active" href="/admin"><span>⌂</span><b>Главная</b></a>
      <a href="/admin/schedule"><span>▣</span><b>Календарь</b></a>
      <a href="/admin/my-clients"><span>◇</span><b>Клиенты</b></a>
      <a href="/admin/profile"><span>◎</span><b>Настройки</b></a>
      <a href="/"><span>↗</span><b>Клиент</b></a>
    </nav>
  );
}

export default async function AdminPage() {
  if (!isAdmin()) redirect("/admin/login");

  const todayKey = businessDateKey(new Date());
  const tomorrowKey = addBusinessDays(todayKey, 1);
  const today = businessDateFromKey(todayKey);
  const tomorrow = businessDateFromKey(tomorrowKey);
  const todayStart = businessDateFromKey(todayKey);
  const todayEnd = businessDateFromKey(tomorrowKey);
  const tomorrowStart = businessDateFromKey(tomorrowKey);
  const afterTomorrowStart = businessDateFromKey(addBusinessDays(tomorrowKey, 1));
  const horizon = businessDateFromKey(addBusinessDays(todayKey, 21));

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
    prisma.booking.findMany({ where: { status: "PENDING" }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 6 }),
    prisma.client.count({ where: { status: "APPROVED" } }),
    prisma.waitlistEntry.findMany({ where: { status: "ACTIVE" }, include: { client: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.booking.findMany({
      where: { startAt: { gte: todayStart, lt: todayEnd }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "NO_SHOW"] } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
      take: 10
    }),
    prisma.booking.findMany({
      where: { startAt: { gte: tomorrowStart, lt: afterTomorrowStart }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "NO_SHOW"] } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
      take: 10
    }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: todayStart, lt: horizon } }, orderBy: { startAt: "asc" }, take: 40 }),
    prisma.booking.findMany({ where: { startAt: { gte: todayStart, lt: horizon }, status: { in: ["PENDING", "CONFIRMED"] } }, select: { startAt: true } })
  ]);

  const requestCount = pendingClients.length + pendingBookings.length;
  const busySet = new Set(busyBookings.map((booking) => booking.startAt.toISOString()));
  const freeWindows = onlineWindows.filter((window) => !busySet.has(window.startAt.toISOString())).slice(0, 7);

  return (
    <main className="master-dashboard">
      <Sidebar requestCount={requestCount} waitlistCount={waitlist.length} />

      <section className="master-main admin-workdesk">
        <section className="mobile-master-home" aria-label="Мобильная главная мастера">
          <header className="mobile-master-topbar">
            <div>
              <b>Главная</b>
              <span>{fmtTopDate(today)}</span>
            </div>
            <a href="/admin/manage">Новая запись</a>
          </header>

          <MobileBookingCard title="Сегодня" date={today} bookings={todayBookings} />
          <MobileBookingCard title="Завтра" date={tomorrow} bookings={tomorrowBookings} />
          <MobileRequestsPanel pendingClients={pendingClients} pendingBookings={pendingBookings} />
          <MobileWaitlistPanel waitlist={waitlist} />
          <MobileBottomNav />
        </section>

        <div className="desktop-master-home">
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
        </div>
      </section>
    </main>
  );
}
