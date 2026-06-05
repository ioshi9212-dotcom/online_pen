import { setBookingStatus } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { formatDateTime, rub } from "@/lib/format";
import { bookingStatusLabel, statusClass } from "@/lib/statusLabels";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  if (!isAdmin()) redirect("/admin/login");
  const bookings = await prisma.booking.findMany({
    include: { client: true, service: true },
    orderBy: { startAt: "asc" },
    take: 100
  });

  return (
    <section className="card">
      <h1>Записи</h1>
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
                <form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="CONFIRMED" /><button className="ok">Подтвердить</button></form>
                <form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="REJECTED" /><button className="danger">Отклонить</button></form>
                <form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="COMPLETED" /><button className="secondary">Пришла</button></form>
                <form action={setBookingStatus}><input type="hidden" name="id" value={booking.id} /><input type="hidden" name="status" value="NO_SHOW" /><button className="secondary">Не пришла</button></form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
