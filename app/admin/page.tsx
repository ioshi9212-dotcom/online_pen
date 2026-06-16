import { approveClient, closeWaitlistEntry, rejectClient, setBookingStatus } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function fmt(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default async function AdminPage() {
  if (!isAdmin()) redirect("/admin/login");

  const [pendingClients, pendingBookings, activeClients, services, waitlist] = await Promise.all([
    prisma.client.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.booking.findMany({ where: { status: "PENDING" }, include: { client: true, service: true }, orderBy: { startAt: "asc" }, take: 8 }),
    prisma.client.count({ where: { status: "APPROVED" } }),
    prisma.service.count({ where: { isActive: true } }),
    prisma.waitlistEntry.findMany({ where: { status: "ACTIVE" }, include: { client: true }, orderBy: { createdAt: "desc" }, take: 8 })
  ]);

  return (
    <main className="admin-page">
      <section className="hero">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div><h1>Админка</h1><p>Простое меню мастера без лишнего дизайна.</p></div>
          <a className="button secondary" href="/admin/logout">Выйти</a>
        </div>
      </section>

      <section className="admin-menu-grid">
        <a className="admin-menu-card" href="/admin/manage"><h3>Ручная запись</h3><p>Записать клиентку вручную</p></a>
        <a className="admin-menu-card" href="/admin/my-clients"><h3>Клиенты</h3><p>База клиентов</p></a>
        <a className="admin-menu-card" href="/admin/schedule"><h3>Расписание</h3><p>Свободные окна и календарь</p></a>
        <a className="admin-menu-card" href="/admin/services"><h3>Прайс</h3><p>Услуги и цены</p></a>
        <a className="admin-menu-card" href="/admin/requests"><h3>Заявки</h3><p>Подтверждение клиентов</p></a>
        <a className="admin-menu-card" href="/admin/profile"><h3>Профиль мастера</h3><p>Настройки</p></a>
      </section>

      <section className="kpi-grid">
        <div className="kpi-card"><h2>{pendingClients.length}</h2><p>новых клиентов</p></div>
        <div className="kpi-card"><h2>{pendingBookings.length}</h2><p>заявок на запись</p></div>
        <div className="kpi-card"><h2>{activeClients}</h2><p>клиентов в базе</p></div>
        <div className="kpi-card"><h2>{services}</h2><p>активных услуг</p></div>
      </section>

      <section className="top-split">
        <article className="card">
          <h2>Заявки клиентов</h2>
          <div className="grid">
            {pendingClients.map((client) => <div className="card" key={client.id}><b>{client.lastName} {client.firstName}</b><p>{client.phone}</p><div className="actions"><form action={approveClient}><input type="hidden" name="id" value={client.id} /><button>Подтвердить</button></form><form action={rejectClient}><input type="hidden" name="id" value={client.id} /><button className="danger">Отклонить</button></form></div></div>)}
            {pendingClients.length === 0 ? <p>Новых заявок нет.</p> : null}
          </div>
        </article>
        <article className="card">
          <h2>Заявки на запись</h2>
          <div className="grid">
            {pendingBookings.map((booking) => <div className="card" key={booking.id}><b>{fmt(booking.startAt)}</b><p>{booking.client.firstName} {booking.client.lastName} · {booking.service.title}</p><div className="actions"><form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="CONFIRMED" /><input type="hidden" name="redirectTo" value="/admin" /><button>Подтвердить</button></form><form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="REJECTED" /><input type="hidden" name="redirectTo" value="/admin" /><button className="danger">Отклонить</button></form></div></div>)}
            {pendingBookings.length === 0 ? <p>Заявок на запись нет.</p> : null}
          </div>
        </article>
      </section>

      <section className="card">
        <h2>Ждуны</h2>
        <div className="grid">
          {waitlist.map((entry) => <div className="card" key={entry.id}><b>{entry.client.lastName} {entry.client.firstName}</b><p>{entry.note || "Без комментария"}</p><form action={closeWaitlistEntry}><input type="hidden" name="id" value={entry.id} /><button className="secondary">Убрать</button></form></div>)}
          {waitlist.length === 0 ? <p>Лист ожидания пуст.</p> : null}
        </div>
      </section>
    </main>
  );
}
