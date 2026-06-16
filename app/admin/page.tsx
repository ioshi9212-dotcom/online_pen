import { approveClient, closeWaitlistEntry, rejectClient, setBookingStatus } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { formatTimeOnly, rub } from "@/lib/format";
import { bookingStatusLabel, statusClass } from "@/lib/statusLabels";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
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

function startOfWeek(date: Date) {
  const result = startOfDay(date);
  const diff = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - diff);
  return result;
}

function monthInfo(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  return { first, end, days, offset, title: new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(first) };
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function settingValue(settings: Array<{ key: string; value: string }>, key: string, fallback = "") {
  return settings.find((item) => item.key === key)?.value || fallback;
}

function selectedDayTitle(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(date);
}

function fullDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function timeRange(start: Date, end: Date) {
  return `${formatTimeOnly(start)} – ${formatTimeOnly(end)}`;
}

function parseDesiredDates(value: string) {
  try {
    const dates = JSON.parse(value || "[]") as string[];
    return dates.map((date) => new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")).join(", ");
  } catch {
    return "";
  }
}

function Sidebar({ masterName, masterPhotoUrl, requestCount, waitlistCount }: { masterName: string; masterPhotoUrl: string; requestCount: number; waitlistCount: number }) {
  const menu = [
    ["Главная", "/admin", "⌂", "active", ""],
    ["Записи", "/admin/bookings", "□", "", ""],
    ["Клиенты", "/admin/my-clients", "◌", "", ""],
    ["Расписание", "/admin/schedule", "▣", "", ""],
    ["Прайс", "/admin/services", "◇", "", ""],
    ["Услуги", "/admin/services", "✦", "", ""],
    ["Заявки", "/admin/requests", "✉", "", String(requestCount || "")],
    ["Ждуны", "/admin#waitlist", "◷", "", String(waitlistCount || "")],
    ["Аналитика", "/admin#analytics", "▥", "", ""]
  ];

  return (
    <aside className="dash-sidebar">
      <a href="/admin" className="dash-brand"><span className="dash-logo">O</span><span><b>Онлайн-запись</b><small>Запись без хаоса</small></span></a>
      <nav className="dash-nav" aria-label="Админ-меню">
        {menu.map(([label, href, icon, active, badge]) => <a key={label} href={href} className={active ? "active" : ""}><span>{icon}</span><b>{label}</b>{badge ? <em>{badge}</em> : null}</a>)}
      </nav>
      <div className="dash-master"><div className="dash-master-avatar">{masterPhotoUrl ? <img src={masterPhotoUrl} alt="Фото мастера" /> : masterName.slice(0, 1).toUpperCase()}</div><div><b>{masterName}</b><small>Мастер маникюра</small></div><span>⌄</span></div>
      <a className="dash-logout" href="/admin/logout">↳ Выйти</a>
    </aside>
  );
}

export default async function AdminPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  if (!isAdmin()) redirect("/admin/login");

  const today = new Date();
  const selectedDay = dateFromKey(one(searchParams, "date"));
  const selectedKey = dateKey(selectedDay);
  const tomorrow = addDays(today, 1);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 7);
  const month = monthInfo(today);
  const selectedStart = startOfDay(selectedDay);
  const selectedEnd = endOfDay(selectedDay);

  const [settings, pendingClients, pendingBookings, todayBookings, tomorrowBookings, weekBookingsCount, waitlistEntries, activeClientCount, activeServiceCount, monthBookings, selectedBookings, selectedOnlineWindows] = await Promise.all([
    prisma.setting.findMany({ where: { key: { in: ["master_name", "master_photo_url"] } } }),
    prisma.client.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.booking.findMany({ where: { status: "PENDING" }, include: { client: true, service: true }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.booking.findMany({ where: { startAt: { gte: startOfDay(today), lte: endOfDay(today) }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 7 }),
    prisma.booking.findMany({ where: { startAt: { gte: startOfDay(tomorrow), lte: endOfDay(tomorrow) }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 7 }),
    prisma.booking.count({ where: { startAt: { gte: weekStart, lt: weekEnd }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } } }),
    prisma.waitlistEntry.findMany({ where: { status: "ACTIVE" }, include: { client: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.client.count({ where: { status: "APPROVED" } }),
    prisma.service.count({ where: { isActive: true } }),
    prisma.booking.findMany({ where: { startAt: { gte: month.first, lt: month.end }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } }, include: { service: true }, orderBy: { startAt: "asc" } }),
    prisma.booking.findMany({ where: { startAt: { gte: selectedStart, lte: selectedEnd }, status: { in: ["PENDING", "CONFIRMED"] } }, include: { client: true, service: true }, orderBy: { startAt: "asc" } }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: selectedStart, lte: selectedEnd } }, orderBy: { startAt: "asc" } })
  ]);

  const masterName = settingValue(settings, "master_name", "Мария Иванова");
  const masterPhotoUrl = settingValue(settings, "master_photo_url");
  const requestsCount = pendingClients.length + pendingBookings.length;
  const monthRevenue = monthBookings.reduce((sum, booking) => sum + (booking.finalPrice ?? booking.service.price ?? 0), 0);
  const waitlistCount = waitlistEntries.length;
  const freeStarts = selectedOnlineWindows.filter((window) => !selectedBookings.some((booking) => booking.startAt.getTime() === window.startAt.getTime()));
  const selectedSlots = [...selectedBookings.map((booking) => ({ kind: "busy" as const, startAt: booking.startAt, endAt: booking.endAt, label: booking.status === "PENDING" ? "Ожидает" : "Занято" })), ...freeStarts.map((window) => ({ kind: "free" as const, startAt: window.startAt, endAt: new Date(window.startAt.getTime() + 60 * 60_000), label: "Свободно" }))].sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).slice(0, 6);
  const selectedWindowStats = `${selectedBookings.length} занято · ${freeStarts.length} свободно`;
  const scheduleRows = todayBookings.length ? todayBookings : tomorrowBookings;
  const scheduleLabel = todayBookings.length ? "Сегодня" : "Завтра";
  const requestRows = [...pendingClients.map((client) => ({ id: `client-${client.id}`, type: "client" as const, title: `${client.lastName} ${client.firstName}`, subtitle: `Новый клиент · ${client.phone}`, time: client.createdAt })), ...pendingBookings.map((booking) => ({ id: `booking-${booking.id}`, type: "booking" as const, title: `${booking.client.lastName} ${booking.client.firstName}`, subtitle: `${booking.service.title} · ${rub(booking.finalPrice ?? booking.service.price)}`, time: booking.createdAt }))].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 3);
  const days = Array.from({ length: month.days }).map((_, index) => { const day = new Date(today.getFullYear(), today.getMonth(), index + 1); const key = dateKey(day); const bookings = monthBookings.filter((booking) => dateKey(booking.startAt) === key).length; return { day, key, bookings, isSelected: key === selectedKey }; });

  return (
    <div className="admin-dashboard-shell">
      <Sidebar masterName={masterName} masterPhotoUrl={masterPhotoUrl} requestCount={requestsCount} waitlistCount={waitlistCount} />
      <main className="admin-dashboard-main">
        <div className="dash-topbar"><div><h1>{greeting()}, {masterName.split(" ")[0]}! ✦</h1><p>{fullDate(today)}</p></div><div className="dash-top-actions"><a href="/admin/requests" aria-label="Заявки">♧<span>{requestsCount}</span></a><a href="/admin/schedule" aria-label="Расписание">▣</a><a href="/admin/profile" aria-label="Профиль">{masterName.slice(0, 1).toUpperCase()}</a></div></div>
        <section className="dash-hero-row"><a className="dash-hero-card" href="/admin/manage"><span className="dash-hero-icon">✎</span><div><h2>Ручная запись</h2><p>Записать клиента, выбрать из базы или быстро закрыть свободное окно</p></div><b>›</b></a><div className="dash-shortcuts"><a href="/admin/manage?add=1#add-client"><span>☻</span><b>Новый клиент</b><small>Создать карточку и записать</small></a><a href="/admin/manage#manual-booking"><span>◌</span><b>Клиент из базы</b><small>Выбрать из клиентской базы</small></a><a href="/admin/schedule"><span>◷</span><b>Свободное окно</b><small>Найти и закрыть окно</small></a><a href="/admin/requests"><span>✉</span><b>Заявка</b><small>Новые заявки от клиентов</small><em>{requestsCount}</em></a></div></section>
        <section className="dash-kpis"><a href="/admin/bookings"><span>▣</span><b>{weekBookingsCount}</b><p>записей на этой неделе</p><small>активные и завершённые</small></a><a href="/admin/requests"><span>✉</span><b>{requestsCount}</b><p>заявок на рассмотрении</p><small>{pendingBookings.length} по записи</small></a><a href="#waitlist"><span>◌</span><b>{waitlistCount}</b><p>клиентов в листе ожидания</p><small>готовы прийти в окно</small></a><a href="#analytics"><span>▤</span><b>{rub(monthRevenue)}</b><p>доход за месяц</p><small>по созданным записям</small></a></section>
        <section className="dash-content-grid">
          <article className="dash-panel schedule-panel"><div className="dash-panel-head"><div><h2>Расписание</h2><p>{scheduleLabel}</p></div><a href="/admin/schedule">Открыть расписание</a></div><div className="dash-tabs"><span className={scheduleLabel === "Сегодня" ? "active" : ""}>Сегодня</span><span className={scheduleLabel === "Завтра" ? "active" : ""}>Завтра</span></div><div className="dash-list">{scheduleRows.length === 0 ? <div className="dash-empty">Записей нет. Редкая тишина.</div> : null}{scheduleRows.map((booking) => <div className="dash-row" key={booking.id}><time>{formatTimeOnly(booking.startAt)}</time><i /><b>{booking.client.firstName} {booking.client.lastName}</b><span>{booking.service.title}</span><em className={statusClass(booking.status)}>{bookingStatusLabel(booking.status)}</em></div>)}</div><a className="dash-link" href="/admin/bookings">Показать всё расписание ›</a></article>
          <article className="dash-panel requests-panel"><div className="dash-panel-head"><h2>Заявки</h2><a href="/admin/requests">Смотреть все</a></div><div className="dash-request-list">{requestRows.length === 0 ? <div className="dash-empty">Новых заявок нет.</div> : null}{requestRows.map((item) => <div className="dash-request" key={item.id}><div className="dash-request-avatar">{item.title.slice(0, 1).toUpperCase()}</div><div><b>{item.title}</b><p>{item.subtitle}</p></div><small>{item.type === "client" ? "клиент" : "запись"}</small></div>)}</div><a className="dash-link" href="/admin/requests">Перейти к заявкам ›</a></article>
          <article className="dash-panel free-panel"><div className="dash-panel-head"><div><h2>Свободные окна · {month.title}</h2><p>Нажми дату, чтобы посмотреть день</p></div><a href="/admin/schedule">Редактировать</a></div><div className="free-grid-wrap"><div><div className="mini-calendar-head">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <b key={day}>{day}</b>)}</div><div className="mini-calendar">{Array.from({ length: month.offset }).map((_, index) => <span key={`empty-${index}`} />)}{days.map((day) => <a key={day.key} href={`/admin?date=${day.key}`} className={day.isSelected ? "selected" : ""}><b>{day.day.getDate()}</b>{day.bookings ? <i className="busy" /> : <i />}</a>)}</div></div><div className="selected-windows"><h3>{selectedDayTitle(selectedDay)}</h3><p>{selectedWindowStats}</p><div>{selectedSlots.length === 0 ? <span className="window-slot muted">Окон на дату нет</span> : null}{selectedSlots.map((slot) => <span className={`window-slot ${slot.kind}`} key={`${slot.kind}-${slot.startAt.toISOString()}`}><b>{timeRange(slot.startAt, slot.endAt)}</b><em>{slot.label}</em></span>)}</div></div></div><p className="dash-note">• занято · • свободно · свободные окна можно добавлять, удалять и редактировать</p></article>
        </section>
        <section className="dash-bottom-grid" id="analytics"><a href="/admin/my-clients"><span>◌</span><b>Клиенты</b><p>База клиентов и история визитов</p><small>{activeClientCount} клиентов</small></a><a href="/admin/services"><span>◇</span><b>Прайс</b><p>Услуги и цены</p><small>{activeServiceCount} активных услуг</small></a><a href="/admin/services"><span>✦</span><b>Услуги</b><p>Настройка услуг и длительности</p><small>редактировать</small></a><a href="/admin/profile"><span>☻</span><b>Профиль мастера</b><p>Информация и настройки</p><small>ваш профиль</small></a><a className="dashed" href="/admin/schedule/free"><span>＋</span><b>Быстрые окна</b><p>Список открытых онлайн-окон</p></a></section>
        <section className="dash-panel waitlist-panel" id="waitlist"><div className="dash-panel-head"><div><h2>Ждуны</h2><p>Клиенты, которые ждут ближайшее окно или конкретные даты</p></div><span>{waitlistEntries.length}</span></div><div className="dash-request-list">{waitlistEntries.length === 0 ? <div className="dash-empty">Пока в листе ожидания никого нет.</div> : null}{waitlistEntries.map((entry) => { const dates = parseDesiredDates(entry.desiredDates); return <div className="dash-request" key={entry.id}><div className="dash-request-avatar">{entry.client.firstName.slice(0, 1).toUpperCase()}</div><div><b>{entry.client.lastName} {entry.client.firstName}</b><p>{entry.mode === "DATES" ? `Даты: ${dates || "не выбраны"}` : "Хочет ближайшее свободное окно"}</p>{entry.note ? <small>{entry.note}</small> : null}</div><form action={closeWaitlistEntry}><input type="hidden" name="id" value={entry.id} /><button className="secondary">Убрать</button></form></div>; })}</div></section>
      </main>
    </div>
  );
}
