import { approveClient, closeWaitlistEntry, rejectClient, setBookingStatus } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function fmt(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
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
    ["Аналитика", "/admin#analytics", "↗", ""]
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

export default async function AdminPage() {
  if (!isAdmin()) redirect("/admin/login");

  const { start, end } = todayRange();

  const [
    pendingClients,
    pendingBookings,
    activeClients,
    services,
    waitlist,
    todayBookings,
    totalBookings
  ] = await Promise.all([
    prisma.client.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.booking.findMany({ where: { status: "PENDING" }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 8 }),
    prisma.client.count({ where: { status: "APPROVED" } }),
    prisma.service.count({ where: { isActive: true } }),
    prisma.waitlistEntry.findMany({ where: { status: "ACTIVE" }, include: { client: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.booking.findMany({
      where: { startAt: { gte: start, lte: end }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
      take: 8
    }),
    prisma.booking.count()
  ]);

  const requestCount = pendingClients.length + pendingBookings.length;

  return (
    <main className="master-dashboard">
      <Sidebar requestCount={requestCount} waitlistCount={waitlist.length} />

      <section className="master-main">
        <header className="master-header">
          <div>
            <p className="eyebrow">Кабинет мастера</p>
            <h1>Главная</h1>
            <p>Быстрый доступ к записи, клиентам, заявкам и расписанию.</p>
          </div>
          <div className="actions">
            <a className="button" href="/admin/manage">Ручная запись</a>
            <a className="button secondary" href="/admin/profile">Профиль</a>
          </div>
        </header>

        <section className="master-action-row">
          <a className="master-primary-action" href="/admin/manage">
            <span>✎</span>
            <div><h2>Ручная запись</h2><p>Записать клиента, выбрать из базы или быстро закрыть свободное окно.</p></div>
          </a>

          <div className="master-shortcuts">
            <a href="/admin/manage?add=1#add-client"><b>Новый клиент</b><small>Создать карточку и записать</small></a>
            <a href="/admin/manage#manual-booking"><b>Клиент из базы</b><small>Выбрать из клиентской базы</small></a>
            <a href="/admin/schedule"><b>Свободное окно</b><small>Подобрать и заполнить</small></a>
            <a href="/admin/requests"><b>Заявка</b><small>Новые заявки от клиентов</small><em>{requestCount}</em></a>
          </div>
        </section>

        <section className="kpi-grid">
          <div className="kpi-card"><h2>{totalBookings}</h2><p>записей всего</p></div>
          <div className="kpi-card"><h2>{requestCount}</h2><p>заявок на рассмотрении</p></div>
          <div className="kpi-card"><h2>{waitlist.length}</h2><p>клиентов в листе ожидания</p></div>
          <div className="kpi-card"><h2>{activeClients}</h2><p>клиентов в базе</p></div>
        </section>

        <section className="master-panels">
          <article className="card">
            <div className="section-head">
              <div><h2>Сегодня</h2><p>Записи на день</p></div>
              <a className="button secondary" href="/admin/schedule">Расписание</a>
            </div>

            <div className="simple-list">
              {todayBookings.map((booking) => (
                <div className="simple-row" key={booking.id}>
                  <b>{fmt(booking.startAt)}</b>
                  <span>{booking.client.firstName} {booking.client.lastName}</span>
                  <small>{booking.service.title}</small>
                </div>
              ))}
              {todayBookings.length === 0 ? <p>Сегодня записей нет.</p> : null}
            </div>
          </article>

          <article className="card">
            <div className="section-head">
              <div><h2>Заявки</h2><p>Клиенты и записи на подтверждение</p></div>
              <a className="button secondary" href="/admin/requests">Все</a>
            </div>

            <div className="simple-list">
              {pendingClients.map((client) => (
                <div className="simple-row" key={client.id}>
                  <b>{client.lastName} {client.firstName}</b>
                  <span>{client.phone}</span>
                  <div className="actions">
                    <form action={approveClient}><input type="hidden" name="id" value={client.id} /><button>Подтвердить</button></form>
                    <form action={rejectClient}><input type="hidden" name="id" value={client.id} /><button className="danger">Отклонить</button></form>
                  </div>
                </div>
              ))}

              {pendingBookings.map((booking) => (
                <div className="simple-row pending-row" key={booking.id}>
                  <b>{fmt(booking.startAt)}</b>
                  <span>{booking.client.firstName} {booking.client.lastName} · {booking.service.title}</span>
                  <div className="actions">
                    <form action={setBookingStatus}>
                      <input type="hidden" name="id" value={booking.id} />
                      <input type="hidden" name="status" value="CONFIRMED" />
                      <input type="hidden" name="redirectTo" value="/admin" />
                      <button>Подтвердить</button>
                    </form>
                    <form action={setBookingStatus}>
                      <input type="hidden" name="id" value={booking.id} />
                      <input type="hidden" name="status" value="REJECTED" />
                      <input type="hidden" name="redirectTo" value="/admin" />
                      <button className="danger">Отклонить</button>
                    </form>
                  </div>
                </div>
              ))}

              {requestCount === 0 ? <p>Новых заявок нет.</p> : null}
            </div>
          </article>
        </section>

        <section className="master-bottom-grid">
          <a className="admin-menu-card" href="/admin/my-clients"><h3>Клиенты</h3><p>База клиентов и история</p></a>
          <a className="admin-menu-card" href="/admin/services"><h3>Прайс</h3><p>Услуги и цены</p></a>
          <a className="admin-menu-card" href="/admin/schedule"><h3>Расписание</h3><p>Свободные окна</p></a>
          <a className="admin-menu-card" href="/admin/profile"><h3>Профиль мастера</h3><p>Информация и настройки</p></a>
        </section>

        <section className="card" id="waitlist">
          <div className="section-head">
            <div><h2>Ждуны</h2><p>Клиенты, которые ждут ближайшее окно</p></div>
            <span className="badge">{waitlist.length}</span>
          </div>

          <div className="grid">
            {waitlist.map((entry) => (
              <div className="card" key={entry.id}>
                <b>{entry.client.lastName} {entry.client.firstName}</b>
                <p>{entry.note || "Без комментария"}</p>
                <form action={closeWaitlistEntry}>
                  <input type="hidden" name="id" value={entry.id} />
                  <button className="secondary">Убрать</button>
                </form>
              </div>
            ))}
            {waitlist.length === 0 ? <p>Лист ожидания пуст.</p> : null}
          </div>
        </section>
      </section>
    </main>
  );
}
