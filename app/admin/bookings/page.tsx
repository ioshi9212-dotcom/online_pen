import { setBookingStatus } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { formatDateTime, rub } from "@/lib/format";
import { bookingStatusLabel, statusClass } from "@/lib/statusLabels";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function canCancel(status: string, startAt: Date) {
  return ["PENDING", "CONFIRMED"].includes(status) && startAt > new Date();
}

export default async function AdminBookingsPage() {
  if (!isAdmin()) redirect("/admin/login");
  const bookings = await prisma.booking.findMany({
    include: { client: true, service: true },
    orderBy: { startAt: "asc" },
    take: 100
  });

  return (
    <section className="card">
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Записи</h1>
          <p>Все ближайшие заявки и записи. Отмена записи возвращает её время в открытые онлайн-окна, если оно ещё не прошло и не занято.</p>
        </div>
        <div className="actions">
          <a className="button secondary" href="/admin">Админка</a>
          <a className="button secondary" href="/admin/manage">Ручная запись</a>
          <a className="button secondary" href="/admin/schedule">Расписание</a>
        </div>
      </div>

      {bookings.length === 0 ? <div className="notice">Записей пока нет. Календарь делает вид, что он на отдыхе.</div> : null}

      <table className="table">
        <thead><tr><th>Дата</th><th>Клиент</th><th>Услуга</th><th>Статус</th><th>Комментарий</th><th></th></tr></thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td>{formatDateTime(booking.startAt)}</td>
              <td>{booking.client.lastName} {booking.client.firstName}<br /><span className="small">{booking.client.phone}</span></td>
              <td>{booking.service.title}<br /><span className="small">{rub(booking.finalPrice ?? booking.service.price)}</span></td>
              <td><span className={`status ${statusClass(booking.status)}`}>{bookingStatusLabel(booking.status)}</span></td>
              <td>{booking.clientComment || "—"}</td>
              <td className="actions">
                <a className="button secondary" href={`/admin/bookings/${booking.id}/edit`}>Изменить</a>
                <form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="CONFIRMED" /><input type="hidden" name="redirectTo" value="/admin/bookings?done=1" /><button className="ok">Подтвердить</button></form>
                <form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="REJECTED" /><input type="hidden" name="redirectTo" value="/admin/bookings?done=1" /><button className="danger">Отклонить</button></form>
                {canCancel(booking.status, booking.startAt) ? (
                  <form action={setBookingStatus}>
                    <input type="hidden" name="id" value={booking.id} />
                    <input type="hidden" name="status" value="CANCELLED_BY_ADMIN" />
                    <input type="hidden" name="redirectTo" value="/admin/bookings?done=1" />
                    <button className="danger">Отменить запись</button>
                  </form>
                ) : null}
                <form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="COMPLETED" /><input type="hidden" name="redirectTo" value="/admin/bookings?done=1" /><button className="secondary">Пришла</button></form>
                <form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="NO_SHOW" /><input type="hidden" name="redirectTo" value="/admin/bookings?done=1" /><button className="secondary">Не пришла</button></form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
