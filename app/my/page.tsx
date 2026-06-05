import { cancelClientBooking, joinWaitlist } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { formatDateTime, rub } from "@/lib/format";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

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

function dateOptions(days = 60) {
  const result: { value: string; label: string }[] = [];
  const formatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", weekday: "short" });
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    result.push({ value: date.toISOString().slice(0, 10), label: formatter.format(date) });
  }

  return result;
}

function waitlistText(entry: { mode: string; desiredDates: string; createdAt: Date }) {
  if (entry.mode === "DATES") {
    try {
      const dates = JSON.parse(entry.desiredDates || "[]") as string[];
      if (dates.length) return `Желаемые даты: ${dates.map((date) => new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU")).join(", ")}`;
    } catch {}
  }
  return "Ищет ближайшее свободное окно";
}

export default async function MyPage({ searchParams }: { searchParams: { client?: string; created?: string; waitlist?: string } }) {
  const token = searchParams.client;
  if (!token) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { publicToken: token },
    include: {
      bookings: { include: { service: true }, orderBy: { startAt: "desc" } },
      waitlist: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } }
    }
  });

  if (!client) redirect("/login");

  const dates = dateOptions(60);

  return (
    <div className="grid">
      <section className="card">
        <h1>Мои записи</h1>
        <p>{client.firstName}, здесь видны ваши заявки и подтверждённые записи.</p>
        {searchParams.created ? <div className="notice">Заявка отправлена. Мастер подтвердит или отклонит её в админке.</div> : null}
        {searchParams.waitlist ? <div className="notice">Заявка в лист ожидания отправлена мастеру.</div> : null}
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

      <section className="card">
        <h2>Лист ожидания</h2>
        <p>Не нашли подходящее время? Оставьте заявку, и мастер увидит ваши пожелания.</p>

        {client.waitlist.length ? (
          <div className="notice">
            <b>Вы уже в листе ожидания.</b>
            <ul>
              {client.waitlist.map((entry) => <li key={entry.id}>{waitlistText(entry)}</li>)}
            </ul>
          </div>
        ) : null}

        <details className="soft-details">
          <summary className="button secondary">Добавить себя в лист ожидания</summary>
          <form action={joinWaitlist} className="grid" style={{ marginTop: 16 }}>
            <input type="hidden" name="clientToken" value={token} />
            <label className="radio-card">
              <input type="radio" name="waitMode" value="NEAREST" defaultChecked />
              <span><b>Ближайшее свободное окно</b><br /><small>Мастер увидит, что вы готовы прийти в ближайшее подходящее время.</small></span>
            </label>
            <label className="radio-card">
              <input type="radio" name="waitMode" value="DATES" />
              <span><b>Выбрать удобные даты</b><br /><small>Можно отметить несколько дат на ближайшие два месяца.</small></span>
            </label>
            <details className="soft-details nested">
              <summary>Показать даты на ближайшие 2 месяца</summary>
              <div className="date-pick-grid">
                {dates.map((date) => (
                  <label key={date.value} className="date-chip">
                    <input type="checkbox" name="desiredDates" value={date.value} />
                    <span>{date.label}</span>
                  </label>
                ))}
              </div>
            </details>
            <label>Комментарий
              <textarea name="note" placeholder="Например: могу вечером, лучше после 15:00, нужен ремонт одного ногтя" />
            </label>
            <button>Подтвердить</button>
          </form>
        </details>
      </section>
    </div>
  );
}
