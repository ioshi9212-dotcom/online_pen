import { acknowledgeClientCancellation, approveClient, closeWaitlistEntry, rejectClient, rememberMasterBooking, setBookingStatus } from "@/app/admin/actions";
import { canRememberBooking, hasBookingMark, MASTER_REMEMBER_MARK, rememberOpensLabel, timeUntilBookingLabel } from "@/lib/bookingRemember";
import { isAdmin } from "@/lib/admin";
import { isClientCancelSeen } from "@/lib/cancellationNotice";
import { prisma } from "@/lib/prisma";
import { addBusinessDays, businessDateFromKey, businessDateKey, businessMonthKey, formatInBusinessTime, todayBusinessDateKey } from "@/lib/timezone";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type BookingWithClientService = {
  id: string;
  startAt: Date;
  endAt: Date;
  status: string;
  adminComment: string;
  client: { id: string; firstName: string; lastName: string; phone: string };
  service: { title: string; durationMinutes: number };
};

type OpenWindowGroup = { key: string; title: string; times: string[] };

function upperFirst(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function fmtTime(date: Date) {
  return formatInBusinessTime(date, { hour: "2-digit", minute: "2-digit" });
}

function fmtCompactTime(date: Date) {
  return fmtTime(date).replace(":", ".");
}

function fmtShortDate(date: Date) {
  return formatInBusinessTime(date, { day: "numeric", month: "long" });
}

function fmtDayTitle(date: Date) {
  return upperFirst(formatInBusinessTime(date, { weekday: "long", day: "numeric", month: "long" }));
}

function fmtTopDate(date: Date) {
  return upperFirst(formatInBusinessTime(date, { weekday: "long", day: "numeric", month: "long" }));
}

function fmtOpenWindowTitle(date: Date) {
  const month = upperFirst(formatInBusinessTime(date, { month: "long" }));
  const day = formatInBusinessTime(date, { day: "numeric" });
  const weekday = formatInBusinessTime(date, { weekday: "short" }).replace(".", "");
  return `${month}, ${day} ${weekday}`;
}

function fmtUpcomingLine(date: Date) {
  const month = formatInBusinessTime(date, { month: "long" });
  const day = formatInBusinessTime(date, { day: "numeric" });
  const weekday = formatInBusinessTime(date, { weekday: "short" }).replace(".", "").toUpperCase();
  return `${month}, ${day}, ${weekday}, ${fmtCompactTime(date)}`;
}

function dayRange(key: string) {
  const start = businessDateFromKey(key);
  const end = businessDateFromKey(addBusinessDays(key, 1));
  return { start, end };
}

function durationLabel(startAt: Date, endAt: Date) {
  const minutes = Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60_000));
  if (!minutes) return "длительность не указана";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function scheduleHref(date: Date) {
  const key = businessDateKey(date);
  return `/admin/schedule?view=calendar&month=${businessMonthKey(date)}&date=${key}#selected-day`;
}

function editHref(booking: BookingWithClientService) {
  return `/admin/bookings/${booking.id}/edit`;
}

function statusText(status: string) {
  if (status === "PENDING") return "Не подтверждено";
  if (status === "CONFIRMED") return "Предстоит";
  if (status === "COMPLETED") return "Завершена";
  if (status === "CANCELLED_BY_CLIENT") return "Клиент отменил";
  if (status === "CANCELLED_BY_ADMIN") return "Отменена";
  if (status === "REJECTED") return "Отклонена";
  if (status === "NO_SHOW") return "Не пришла";
  return status;
}

function statusClass(status: string) {
  if (status === "PENDING") return "admin-status wait";
  if (status === "CONFIRMED") return "admin-status ok";
  if (status === "COMPLETED") return "admin-status done";
  if (status === "CANCELLED_BY_CLIENT") return "admin-status cancelled";
  return "admin-status";
}

function isLateClientCancellation(booking: { status: string; startAt: Date; cancelledAt: Date | null }) {
  if (booking.status !== "CANCELLED_BY_CLIENT" || !booking.cancelledAt) return false;
  const noticeMs = booking.startAt.getTime() - booking.cancelledAt.getTime();
  return noticeMs >= 0 && noticeMs <= 48 * 60 * 60 * 1000;
}

function shouldShowDayBooking(booking: { status: string; startAt: Date; cancelledAt: Date | null; adminComment: string }) {
  if (["PENDING", "CONFIRMED"].includes(booking.status)) return true;
  return isLateClientCancellation(booking) && !isClientCancelSeen(booking.adminComment);
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

function BookingStatusForm({ booking, status, label, className = "secondary" }: { booking: BookingWithClientService; status: string; label: string; className?: string }) {
  return (
    <form action={setBookingStatus}>
      <input type="hidden" name="id" value={booking.id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="redirectTo" value="/admin" />
      <button type="submit" className={className}>{label}</button>
    </form>
  );
}

function MasterRememberControl({ booking }: { booking: BookingWithClientService }) {
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) return null;

  const remembered = hasBookingMark(booking.adminComment, MASTER_REMEMBER_MARK);
  if (remembered) return <span className="master-reminder-hint is-done">Мастер помнит</span>;

  if (!canRememberBooking(booking.startAt)) {
    return <span className="master-reminder-hint">«Помню» появится {rememberOpensLabel(booking.startAt)}</span>;
  }

  return (
    <form action={rememberMasterBooking}>
      <input type="hidden" name="id" value={booking.id} />
      <input type="hidden" name="redirectTo" value="/admin" />
      <button type="submit">Помню про запись</button>
    </form>
  );
}

function BookingQuickActions({ booking }: { booking: BookingWithClientService }) {
  if (booking.status === "CANCELLED_BY_CLIENT") {
    return (
      <form action={acknowledgeClientCancellation} className="master-cancel-ack-form">
        <input type="hidden" name="id" value={booking.id} />
        <input type="hidden" name="redirectTo" value="/admin" />
        <button type="submit">Видела</button>
      </form>
    );
  }

  return (
    <div className="master-booking-actions-panel">
      <MasterRememberControl booking={booking} />

      {booking.status === "PENDING" ? (
        <>
          <BookingStatusForm booking={booking} status="CONFIRMED" label="Подтвердить" className="ok" />
          <BookingStatusForm booking={booking} status="REJECTED" label="Отклонить" className="danger" />
        </>
      ) : null}

      {booking.status === "CONFIRMED" ? (
        <>
          <BookingStatusForm booking={booking} status="COMPLETED" label="Завершить" />
          <BookingStatusForm booking={booking} status="NO_SHOW" label="Не пришла" />
          <BookingStatusForm booking={booking} status="CANCELLED_BY_ADMIN" label="Отменить" className="danger" />
        </>
      ) : null}

      {booking.status === "COMPLETED" || booking.status === "NO_SHOW" || booking.status === "REJECTED" || booking.status === "CANCELLED_BY_ADMIN" ? (
        <a className="button secondary" href={scheduleHref(booking.startAt)}>Открыть день</a>
      ) : null}

      {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
        <>
          <a className="button secondary" href={editHref(booking)}>Изменить</a>
          <a className="button secondary" href={scheduleHref(booking.startAt)}>Открыть день</a>
        </>
      ) : null}
    </div>
  );
}

function Sidebar({ requestCount, waitlistCount }: { requestCount: number; waitlistCount: number }) {
  const items = [
    ["Главная", "/admin", "⌂", ""],
    ["Записи", "/admin/bookings", "□", ""],
    ["Клиенты", "/admin/my-clients", "◇", ""],
    ["Расписание", "/admin/schedule", "▣", ""],
    ["Настройки записи", "/admin/schedule?view=mode", "⚙", ""],
    ["Прайс", "/admin/services", "₽", ""],
    ["Заявки", "/admin/requests", "!", String(requestCount || "")],
    ["Ждуны", "/admin#waitlist", "◷", String(waitlistCount || "")],
    ["Профиль", "/admin/profile", "◎", ""]
  ];

  return (
    <aside className="master-sidebar">
      <a className="master-brand" href="/admin"><span className="master-brand-icon">O</span><span><b>Онлайн-запись</b><small>кабинет мастера</small></span></a>
      <nav className="master-nav" aria-label="Меню мастера">
        {items.map(([label, href, icon, badge]) => (
          <a key={label} href={href} className={label === "Главная" ? "active" : ""}>
            <span>{icon}</span><b>{label}</b>{badge ? <em>{badge}</em> : null}
          </a>
        ))}
      </nav>
      <div className="master-profile-mini"><span>М</span><div><b>Мастер</b><small>администратор</small></div></div>
      <a className="master-logout" href="/admin/logout">Выйти</a>
    </aside>
  );
}

function BookingList({ title, date, bookings }: { title: string; date: Date; bookings: BookingWithClientService[] }) {
  return (
    <article className="admin-home-panel master-day-card">
      <div className="master-day-head"><div><h2>{title} <em>{bookings.length}</em></h2></div><span>{fmtDayTitle(date)}</span></div>
      <div className="master-booking-list">
        {bookings.map((booking) => {
          const cancelled = booking.status === "CANCELLED_BY_CLIENT";
          return (
            <details className={cancelled ? "master-booking-row is-cancelled master-booking-details" : "master-booking-row master-booking-details"} key={booking.id}>
              <summary className="master-booking-link">
                <time>{fmtTime(booking.startAt)}</time>
                <div className="master-booking-main"><b>{booking.client.lastName} {booking.client.firstName}</b><small>{durationLabel(booking.startAt, booking.endAt)} · {booking.service.title} · {timeUntilBookingLabel(booking.startAt)}</small></div>
                <span className={statusClass(booking.status)}>{statusText(booking.status)}</span><i aria-hidden="true">⌄</i>
              </summary>
              <BookingQuickActions booking={booking} />
            </details>
          );
        })}
        {bookings.length === 0 ? <div className="admin-empty">Записей нет. Редкий подарок расписанию.</div> : null}
      </div>
    </article>
  );
}

function UpcomingBookingRow({ booking }: { booking: BookingWithClientService }) {
  return (
    <div className="master-upcoming-row">
      <div className="master-upcoming-main">
        <b>{fmtUpcomingLine(booking.startAt)} — {booking.client.firstName} {booking.client.lastName}</b>
        <small>{booking.service.title} · {statusText(booking.status)}</small>
      </div>
      <a className="button secondary" href={editHref(booking)}>Изменить</a>
    </div>
  );
}

function UpcomingBookings({ bookings }: { bookings: BookingWithClientService[] }) {
  const firstBookings = bookings.slice(0, 3);
  const restBookings = bookings.slice(3);

  return (
    <section className="admin-home-panel master-upcoming-card">
      <div className="master-upcoming-head">
        <div><h2>Ближайшие записи</h2><p>{bookings.length ? `Всего впереди: ${bookings.length}` : "Пока впереди пусто"}</p></div>
        <span className="badge">{bookings.length}</span>
      </div>
      <div className="master-upcoming-list">
        {firstBookings.map((booking) => <UpcomingBookingRow key={booking.id} booking={booking} />)}
        {bookings.length === 0 ? <div className="admin-empty">Будущих записей нет.</div> : null}
      </div>
      {restBookings.length ? (
        <details className="master-upcoming-more">
          <summary><span>Показать все записи</span><i aria-hidden="true">⌄</i></summary>
          <div className="master-upcoming-list">
            {restBookings.map((booking) => <UpcomingBookingRow key={booking.id} booking={booking} />)}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function OpenWindowsStory({ groups }: { groups: OpenWindowGroup[] }) {
  return (
    <section className="admin-home-panel master-open-windows-panel">
      <h2 className="master-open-windows-title">Свободные окна</h2>
      <div className="master-open-windows-list">
        {groups.map((group) => (
          <div key={group.key} className="master-open-window-line">
            <span>{group.title} — {group.times.join(", ")}</span>
          </div>
        ))}
        {groups.length === 0 ? <div className="master-open-windows-empty">Открытых окон пока нет.</div> : null}
      </div>
    </section>
  );
}

export default async function AdminPage() {
  if (!isAdmin()) redirect("/admin/login");

  const now = new Date();
  const todayKey = todayBusinessDateKey();
  const tomorrowKey = addBusinessDays(todayKey, 1);
  const today = businessDateFromKey(todayKey);
  const tomorrow = businessDateFromKey(tomorrowKey);
  const todayRange = dayRange(todayKey);
  const tomorrowRange = dayRange(tomorrowKey);
  const horizon = businessDateFromKey(addBusinessDays(todayKey, 90));

  const [pendingClients, pendingBookings, activeClients, waitlist, rawTodayBookings, rawTomorrowBookings, upcomingBookingsRaw, onlineWindows, busyBookings] = await Promise.all([
    prisma.client.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 4 }),
    prisma.booking.findMany({ where: { status: "PENDING", startAt: { gt: now } }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 4 }),
    prisma.client.count({ where: { status: "APPROVED" } }),
    prisma.waitlistEntry.findMany({ where: { status: "ACTIVE" }, include: { client: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.booking.findMany({ where: { startAt: { gt: now, lt: todayRange.end }, status: { in: ["PENDING", "CONFIRMED", "CANCELLED_BY_CLIENT"] } }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 12 }),
    prisma.booking.findMany({ where: { startAt: { gte: tomorrowRange.start, lt: tomorrowRange.end }, status: { in: ["PENDING", "CONFIRMED", "CANCELLED_BY_CLIENT"] } }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 12 }),
    prisma.booking.findMany({ where: { startAt: { gt: now, lt: horizon }, status: { in: ["PENDING", "CONFIRMED"] } }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 80 }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: now, lt: horizon } }, orderBy: { startAt: "asc" }, take: 300 }),
    prisma.booking.findMany({ where: { startAt: { gte: now, lt: horizon }, status: { in: ["PENDING", "CONFIRMED"] } }, select: { startAt: true } })
  ]);

  const todayBookings = rawTodayBookings.filter(shouldShowDayBooking);
  const tomorrowBookings = rawTomorrowBookings.filter(shouldShowDayBooking);
  const upcomingBookings = upcomingBookingsRaw;
  const requestCount = pendingClients.length + pendingBookings.length;
  const busySet = new Set(busyBookings.map((booking) => booking.startAt.toISOString()));
  const openWindowGroups = Object.values(
    onlineWindows.filter((window) => !busySet.has(window.startAt.toISOString())).reduce<Record<string, OpenWindowGroup>>((acc, window) => {
      const key = businessDateKey(window.startAt);
      if (!acc[key]) acc[key] = { key, title: fmtOpenWindowTitle(window.startAt), times: [] };
      acc[key].times.push(fmtTime(window.startAt));
      return acc;
    }, {})
  );

  return (
    <main className="master-dashboard">
      <Sidebar requestCount={requestCount} waitlistCount={waitlist.length} />
      <section className="master-main admin-workdesk master-mobile-workdesk">
        <style>{`
          .master-open-windows-panel { padding: 16px 18px !important; overflow: visible; }
          .master-open-windows-title { margin: 0 0 8px; font-size: 20px; line-height: 1.2; font-weight: 500; color: #2d2530; }
          .master-open-windows-list { display: grid; gap: 0; }
          .master-open-window-line { padding: 8px 0; border-bottom: 1px solid rgba(80, 58, 68, .14); color: #2d2530; font-size: 15px; line-height: 1.35; font-weight: 400; }
          .master-open-window-line:last-child { border-bottom: 0; }
          .master-open-window-line span { font-weight: 400; }
          .master-open-windows-empty { padding: 8px 0; color: #7c6872; font-size: 15px; font-weight: 400; }
          .master-upcoming-card { padding: 13px 14px !important; }
          .master-upcoming-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
          .master-upcoming-head h2 { margin: 0 !important; font-size: 17px !important; line-height: 1.15 !important; font-weight: 430 !important; }
          .master-upcoming-head p { margin: 3px 0 0; font-size: 12px !important; color: #7a6570; }
          .master-upcoming-list { display: grid; gap: 0; }
          .master-upcoming-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(80, 58, 68, .12); }
          .master-upcoming-row:last-child { border-bottom: 0; }
          .master-upcoming-main { min-width: 0; display: grid; gap: 2px; }
          .master-upcoming-main b { font-size: 12.5px !important; line-height: 1.24 !important; font-weight: 420 !important; color: #2d2530; }
          .master-upcoming-main small { font-size: 11.5px !important; line-height: 1.2 !important; color: #7a6570; }
          .master-upcoming-row .button { min-height: 26px !important; padding: 5px 8px !important; font-size: 11.5px !important; border-radius: 6px !important; }
          .master-upcoming-more { margin-top: 4px; }
          .master-upcoming-more summary::-webkit-details-marker { display: none; }
          .master-upcoming-more summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 0 0; color: #7d3855; font-size: 12px; font-weight: 400; }
          .master-upcoming-more[open] summary i { transform: rotate(180deg); }
          .master-mobile-topbar { grid-template-columns: 1fr !important; }
          .master-request-card summary::-webkit-details-marker { display: none; }
          .master-request-card summary { list-style: none; cursor: pointer; }
          .master-request-title { margin: 0; font-size: 17px; line-height: 1.2; font-weight: 600; }
          .master-request-subtitle { margin: 5px 0 0; font-size: 13px; color: #7a6570; }
          .master-request-arrow::before { content: "⌄"; font-size: 18px; line-height: 1; }
          .master-request-card[open] .master-request-arrow::before { content: "⌃"; }
          .master-request-static-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
          @media (max-width: 760px) { .master-open-windows-panel { padding: 14px 16px !important; } .master-open-windows-title { font-size: 19px; } .master-open-window-line { padding: 7px 0; font-size: 14px; } .master-request-title { font-size: 16px; } .master-upcoming-card { padding: 12px !important; } .master-upcoming-row { grid-template-columns: minmax(0, 1fr) auto; gap: 6px; padding: 6px 0; } .master-upcoming-main b { font-size: 12px !important; } .master-upcoming-row .button { min-height: 25px !important; padding: 5px 7px !important; font-size: 11px !important; } }
        `}</style>

        <header className="master-mobile-topbar"><div><b>Главная</b><span>{fmtTopDate(today)}</span></div></header>
        <header className="admin-home-header master-desktop-header"><div><p className="eyebrow">Кабинет мастера</p><h1>Главная</h1><p>Сегодня, завтра, ближайшие записи, заявки, ждуны и список свободных окон. Без лишней гирлянды.</p></div></header>

        <section className="admin-summary-grid master-desktop-summary" id="analytics"><div className="admin-summary-card"><b>{todayBookings.length}</b><span>сегодня</span></div><div className="admin-summary-card"><b>{tomorrowBookings.length}</b><span>завтра</span></div><div className="admin-summary-card"><b>{upcomingBookings.length}</b><span>впереди</span></div><div className="admin-summary-card"><b>{requestCount}</b><span>заявки</span></div><div className="admin-summary-card"><b>{waitlist.length}</b><span>ждуны</span></div><div className="admin-summary-card"><b>{activeClients}</b><span>клиенты</span></div></section>
        <section className="master-mobile-day-stack"><BookingList title="Сегодня" date={today} bookings={todayBookings} /><BookingList title="Завтра" date={tomorrow} bookings={tomorrowBookings} /></section>
        <UpcomingBookings bookings={upcomingBookings} />

        <section className="master-mobile-request-grid">
          {pendingBookings.length > 0 ? (
            <details className="admin-home-panel master-request-card">
              <summary><div><h3 className="master-request-title">Заявки на запись</h3><p className="master-request-subtitle">новых — {pendingBookings.length}</p></div><span className="master-request-arrow" aria-hidden="true" /></summary>
              <div className="admin-row-list">{pendingBookings.map((booking) => <div className="admin-request-row" key={booking.id}><div className="admin-request-main"><b>{fmtShortDate(booking.startAt)}, {fmtTime(booking.startAt)}</b><small>{booking.client.lastName} {booking.client.firstName} · {booking.service.title} · {timeUntilBookingLabel(booking.startAt, now)}</small></div><div className="admin-request-actions"><form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="CONFIRMED" /><input type="hidden" name="redirectTo" value="/admin" /><button type="submit">Подтвердить</button></form><form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="REJECTED" /><input type="hidden" name="redirectTo" value="/admin" /><button type="submit" className="danger">Отклонить</button></form><a className="button secondary" href={`/admin/bookings/${booking.id}/edit`}>Изменить</a></div></div>)}</div>
            </details>
          ) : (
            <section className="admin-home-panel master-request-card"><div className="master-request-static-head"><div><h3 className="master-request-title">Заявки на запись</h3><p className="master-request-subtitle">Новых нет</p></div></div></section>
          )}

          {pendingClients.length > 0 ? (
            <details className="admin-home-panel master-request-card">
              <summary><div><h3 className="master-request-title">Регистрация</h3><p className="master-request-subtitle">новых — {pendingClients.length}</p></div><span className="master-request-arrow" aria-hidden="true" /></summary>
              <div className="admin-row-list">{pendingClients.map((client) => <div className="admin-request-row" key={client.id}><div className="admin-request-main"><b>{client.lastName} {client.firstName}</b><small>{client.phone}</small></div><div className="admin-request-actions"><form action={approveClient}><input type="hidden" name="id" value={client.id} /><input type="hidden" name="redirectTo" value="/admin" /><button type="submit">Принять</button></form><form action={rejectClient}><input type="hidden" name="id" value={client.id} /><input type="hidden" name="redirectTo" value="/admin" /><button type="submit" className="danger">Отклонить</button></form></div></div>)}</div>
            </details>
          ) : (
            <section className="admin-home-panel master-request-card"><div className="master-request-static-head"><div><h3 className="master-request-title">Регистрация</h3><p className="master-request-subtitle">Новых нет</p></div></div></section>
          )}
        </section>

        <section className="admin-home-panel master-waitlist-card" id="waitlist"><div className="admin-panel-head"><div><h2>Ждуны</h2><p>{waitlist.length ? "Клиенты ждут окно" : "Список ожидания пуст"}</p></div><span className="badge">{waitlist.length}</span></div><div className="admin-row-list">{waitlist.map((entry) => { const dates = parseWaitDates(entry.desiredDates); return <div className="admin-wait-row" key={entry.id}><b>{entry.client.lastName} {entry.client.firstName}</b><small>{waitModeText(entry.mode)}</small>{dates.length ? <div className="admin-wait-dates">{dates.map((date) => <span key={date}>{new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")}</span>)}</div> : null}{entry.note ? <small>{entry.note}</small> : null}<div className="master-wait-actions"><a className="button secondary" href={`/admin/manage?clientId=${entry.clientId}`}>Записать</a><form action={closeWaitlistEntry}><input type="hidden" name="id" value={entry.id} /><button type="submit" className="secondary">Убрать</button></form></div></div>; })}{waitlist.length === 0 ? <div className="admin-empty">Ждунов нет. Невероятно, но красиво.</div> : null}</div></section>
        <OpenWindowsStory groups={openWindowGroups} />
      </section>
    </main>
  );
}