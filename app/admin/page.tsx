import { approveClient, closeWaitlistEntry, rejectClient, setBookingStatus } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { formatDateTime, rub } from "@/lib/format";
import { bookingStatusLabel } from "@/lib/statusLabels";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function parseDesiredDates(value: string) {
  try {
    const dates = JSON.parse(value || "[]") as string[];
    return dates.map((date) => new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")).join(", ");
  } catch {
    return "";
  }
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export default async function AdminPage() {
  if (!isAdmin()) redirect("/admin/login");

  const [pendingClients, pendingBookings, todayBookings, waitlistEntries] = await Promise.all([
    prisma.client.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.booking.findMany({
      where: { status: "PENDING" },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" },
      take: 30
    }),
    prisma.booking.findMany({
      where: {
        startAt: { gte: startOfToday(), lte: endOfToday() },
        status: { in: ["PENDING", "CONFIRMED"] }
      },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" }
    }),
    prisma.waitlistEntry.findMany({
      where: { status: "ACTIVE" },
      include: { client: true },
      orderBy: { createdAt: "desc" },
      take: 50
    })
  ]);

  return (
    <section className="grid">
      <div className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h1>Админка</h1>
            <p>Быстрый доступ к главным разделам. Архив и чёрный список теперь внутри клиентской базы.</p>
          </div>
          <a className="button secondary" href="/admin/logout">Выйти</a>
        </div>

        <div className="admin-menu-grid">
          <a className="menu-card primary" href="/admin/my-clients"><span className="menu-title">Мои клиенты</span><span className="menu-text">База клиентов, редактирование, заметки, архив и чёрный список.</span></a>
          <a className="menu-card" href="/admin/manage"><span className="menu-title">Ручная запись</span><span className="menu-text">Добавить клиента, записать вручную, изменить запись или отменить.</span></a>
          <a className="menu-card" href="/admin/schedule"><span className="menu-title">Расписание</span><span className="menu-text">Свободные окна, календарь, рабочие дни и особенные даты.</span></a>
          <a className="menu-card" href="/admin/services"><span className="menu-title">Прайс</span><span className="menu-text">Услуги, цены, длительность и видимость для клиентов.</span></a>
        </div>

        <div className="sub-links">
          <a href="/admin/requests">Все заявки клиентов</a>
          <a href="/admin/bookings">Все записи</a>
          <a href="/admin/blacklist">Чёрный список</a>
        </div>
      </div>

      <div className="grid-3 dashboard-cards">
        <div className="card compact-card">
          <h2>{pendingClients.length}</h2><p>новых клиентов ждут подтверждения</p>
          <details className="inline-details"><summary className="button secondary">Посмотреть</summary><div className="mini-list">
            {pendingClients.length === 0 ? <div className="notice">Новых заявок нет.</div> : null}
            {pendingClients.map((client) => <div className="mini-item" key={client.id}><b>{client.lastName} {client.firstName}</b><span>{client.phone}</span><span>ДР: {client.birthDate.toISOString().slice(0, 10)}</span>{client.notes ? <small>{client.notes}</small> : null}<div className="actions"><form action={approveClient}><input type="hidden" name="id" value={client.id} /><button className="ok">Подтвердить</button></form><form action={rejectClient}><input type="hidden" name="id" value={client.id} /><button className="danger">Отклонить</button></form></div></div>)}
          </div></details>
        </div>

        <div className="card compact-card">
          <h2>{pendingBookings.length}</h2><p>заявок на запись ждут решения</p>
          <details className="inline-details"><summary className="button secondary">Посмотреть</summary><div className="mini-list">
            {pendingBookings.length === 0 ? <div className="notice">Заявок на запись нет.</div> : null}
            {pendingBookings.map((booking) => <div className="mini-item" key={booking.id}><b>{formatDateTime(booking.startAt)}</b><span>{booking.client.lastName} {booking.client.firstName} — {booking.client.phone}</span><span>{booking.service.title} · {rub(booking.finalPrice ?? booking.service.price)}</span>{booking.clientComment ? <small>{booking.clientComment}</small> : null}<div className="actions"><form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="CONFIRMED" /><input type="hidden" name="redirectTo" value="/admin" /><button className="ok">Подтвердить</button></form><form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="REJECTED" /><input type="hidden" name="redirectTo" value="/admin" /><button className="danger">Отклонить</button></form></div></div>)}
          </div></details>
        </div>

        <div className="card compact-card">
          <h2>{todayBookings.length}</h2><p>активных записей сегодня</p>
          <details className="inline-details"><summary className="button secondary">Посмотреть</summary><div className="mini-list">
            {todayBookings.length === 0 ? <div className="notice">Сегодня активных записей нет.</div> : null}
            {todayBookings.map((booking) => <div className="mini-item" key={booking.id}><b>{formatDateTime(booking.startAt)}</b><span>{booking.client.lastName} {booking.client.firstName} — {booking.client.phone}</span><span>{booking.service.title} · {bookingStatusLabel(booking.status)}</span><div className="actions"><form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="COMPLETED" /><input type="hidden" name="redirectTo" value="/admin" /><button className="ok">Пришла</button></form><form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="NO_SHOW" /><input type="hidden" name="redirectTo" value="/admin" /><button className="danger">Не пришла</button></form></div></div>)}
          </div></details>
        </div>
      </div>

      <div className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}><div><h2>Ждуны</h2><p>Клиенты, которые готовы прийти на ближайшее окно или выбрали удобные даты.</p></div><span className="status wait">{waitlistEntries.length} активных</span></div>
        {waitlistEntries.length === 0 ? <div className="notice">Пока в листе ожидания никого нет.</div> : null}
        <div className="mini-list waitlist-list">
          {waitlistEntries.map((entry) => { const dates = parseDesiredDates(entry.desiredDates); return <div className="mini-item" key={entry.id}><b>{entry.client.lastName} {entry.client.firstName}</b><span>{entry.client.phone}</span><span>{entry.mode === "DATES" ? `Удобные даты: ${dates || "не выбраны"}` : "Хочет ближайшее свободное окно"}</span>{entry.note ? <small>{entry.note}</small> : null}<small>Добавлено: {entry.createdAt.toLocaleDateString("ru-RU")}</small><form action={closeWaitlistEntry}><input type="hidden" name="id" value={entry.id} /><button className="secondary">Убрать из ждунов</button></form></div>; })}
        </div>
      </div>
    </section>
  );
}
