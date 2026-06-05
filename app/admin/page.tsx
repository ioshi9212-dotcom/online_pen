import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  if (!isAdmin()) redirect("/admin/login");

  const [pendingClients, pendingBookings, todayBookings, clientsCount] = await Promise.all([
    prisma.client.count({ where: { status: "PENDING" } }),
    prisma.booking.count({ where: { status: "PENDING" } }),
    prisma.booking.count({ where: { startAt: { gte: new Date(new Date().setHours(0,0,0,0)) }, status: { in: ["PENDING", "CONFIRMED"] } } }),
    prisma.client.count()
  ]);

  return (
    <section className="grid">
      <div className="card">
        <h1>Админка</h1>
        <p>Здесь управление клиентами, заявками, прайсом и расписанием.</p>
        <div className="actions">
          <a className="button" href="/admin/requests">Заявки клиентов</a>
          <a className="button secondary" href="/admin/bookings">Записи</a>
          <a className="button secondary" href="/admin/clients">Клиенты</a>
          <a className="button secondary" href="/admin/services">Прайс</a>
          <a className="button secondary" href="/admin/schedule">Расписание</a>
          <a className="button secondary" href="/admin/blacklist">Чёрный список</a>
        </div>
      </div>
      <div className="grid-2">
        <div className="card"><h2>{pendingClients}</h2><p>новых клиентов ждут подтверждения</p></div>
        <div className="card"><h2>{pendingBookings}</h2><p>заявок на запись ждут решения</p></div>
        <div className="card"><h2>{todayBookings}</h2><p>активных записей сегодня</p></div>
        <div className="card"><h2>{clientsCount}</h2><p>клиентов в базе</p></div>
      </div>
    </section>
  );
}
