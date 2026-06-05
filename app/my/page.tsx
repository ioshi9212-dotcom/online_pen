import { cancelClientBooking } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { formatDateTime, rub } from "@/lib/format";
import { redirect } from "next/navigation";

function statusText(status: string) {
  const map: Record<string, string> = {
    PENDING: "Ожидает подтверждения",
    CONFIRMED: "Подтверждена",
    CANCELLED_BY_CLIENT: "Отменена вами",
    CANCELLED_BY_ADMIN: "Отменена мастером",
    REJECTED: "Отклонена",
    COMPLETED: "Завершена",
    NO_SHOW: "Неявка"
  };
  return map[status] || status;
}

export default async function MyPage({ searchParams }: { searchParams: { client?: string; created?: string } }) {
  const token = searchParams.client;
  if (!token) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { publicToken: token },
    include: { bookings: { include: { service: true }, orderBy: { startAt: "desc" } } }
  });

  if (!client) redirect("/login");

  return (
    <section className="card">
      <h1>Мои записи</h1>
      <p>{client.firstName}, здесь видны ваши заявки и подтверждённые записи.</p>
      {searchParams.created ? <div className="notice">Заявка отправлена. Мастер подтвердит или отклонит её в админке.</div> : null}
      <div className="actions" style={{ marginBottom: 16 }}>
        <a className="button" href={`/booking?client=${token}`}>Записаться ещё</a>
      </div>
      <table className="table">
        <thead><tr><th>Дата</th><th>Услуга</th><th>Статус</th><th>Цена</th><th></th></tr></thead>
        <tbody>
          {client.bookings.map((booking) => (
            <tr key={booking.id}>
              <td>{formatDateTime(booking.startAt)}</td>
              <td>{booking.service.title}</td>
              <td><span className="status">{statusText(booking.status)}</span></td>
              <td>{rub(booking.finalPrice ?? booking.service.price)}</td>
              <td>
                {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
                  <form action={cancelClientBooking}>
                    <input type="hidden" name="clientToken" value={token} />
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button className="danger" type="submit">Отменить</button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
