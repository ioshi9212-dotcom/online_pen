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

function statusClass(status: string) {
  if (status === "CONFIRMED") return "status ok-status";
  if (status === "PENDING") return "status wait";
  if (["CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "NO_SHOW"].includes(status)) return "status danger-status";
  return "status";
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

function Notice({ type }: { type?: string }) {
  if (type === "created") return <div className="notice ok-notice">Заявка отправлена. Я подтвержу — и место будет железно.</div>;
  if (type === "waitlist") return <div className="notice ok-notice">Записала в ждуны. Если окно появится — увижу заявку.</div>;
  if (type === "cancelled") return <div className="notice">Запись отменена. Спасибо, что не исчезла в туман.</div>;
  if (type === "login") return <div className="notice ok-notice">Я тебя узнала. Вот твои записи.</div>;
  if (type === "known") return <div className="notice ok-notice">Ты уже есть в базе. Расписание открыто.</div>;
  return null;
}

export default async function MyPage({ searchParams }: { searchParams: { client?: string; created?: string; waitlist?: string; cancelled?: string; login?: string; known?: string } }) {
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
  if (client.status !== "APPROVED") redirect("/unavailable");

  const dates = dateOptions(60);
  const noticeType = searchParams.created ? "created" : searchParams.waitlist ? "waitlist" : searchParams.cancelled ? "cancelled" : searchParams.login ? "login" : searchParams.known ? "known" : undefined;
  const activeBookings = client.bookings.filter((booking) => ["PENDING", "CONFIRMED"].includes(booking.status));
  const historyBookings = client.bookings.filter((booking) => !["PENDING", "CONFIRMED"].includes(booking.status));

  return (
    <div className="grid page-stack">
      <section className="card profile-hero">
        <div className="avatar-preview">
          {client.avatarUrl ? <img src={client.avatarUrl} alt="Фото клиента" /> : <span>{client.firstName.slice(0, 1).toUpperCase()}</span>}
        </div>
        <div>
          <p className="eyebrow">Личный кабинет</p>
          <h1>Привет, {client.firstName}</h1>
          <p>Тут твои заявки, подтверждённые записи и лист ожидания. Если планы решили умереть — лучше нажать отмену, чем исчезнуть.</p>
        </div>
        <div className="actions profile-actions">
          <a className="button" href={`/booking?client=${token}`}>Новая запись</a>
          <a className="button secondary" href={`/profile?client=${token}`}>Профиль</a>
          <a className="button secondary" href="/price">Прайс</a>
          <a className="quiet-link" href="#waitlist">Лист ожидания</a>
        </div>
      </section>

      <Notice type={noticeType} />

      <section className="card">
        <h2>Активные записи</h2>
        {activeBookings.length === 0 ? (
          <div className="empty-state">
            <h3>Активных записей нет</h3>
            <p>Свободная женщина. Подозрительно, но допустим.</p>
            <a className="button" href={`/booking?client=${token}`}>Выбрать окно</a>
          </div>
        ) : (
          <div className="booking-card-list">
            {activeBookings.map((booking) => (
              <article className="booking-card" key={booking.id}>
                <div>
                  <span className={statusClass(booking.status)}>{statusText(booking.status)}</span>
                  <h3>{formatDateTime(booking.startAt)}</h3>
                  <p>{booking.service.title} · {rub(booking.finalPrice ?? booking.service.price)}</p>
                  {booking.clientComment ? <small>{booking.clientComment}</small> : null}
                </div>
                <details className="soft-details cancel-details">
                  <summary className="button secondary">Отменить</summary>
                  <form action={cancelClientBooking} className="grid">
                    <input type="hidden" name="clientToken" value={token} />
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <p className="small">Точно отменяем? Сайт не осуждает, просто уточняет.</p>
                    <button className="danger" type="submit">Да, отменить</button>
                  </form>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card" id="waitlist">
        <div className="section-head">
          <div>
            <h2>Лист ожидания</h2>
            <p>Если подходящего времени нет — можно оставить заявку. Я увижу пожелания в админке.</p>
          </div>
          {client.waitlist.length ? <span className="status wait">уже в списке</span> : null}
        </div>

        {client.waitlist.length ? (
          <div className="notice">
            <b>Активные заявки:</b>
            <ul>
              {client.waitlist.map((entry) => <li key={entry.id}>{waitlistText(entry)}</li>)}
            </ul>
          </div>
        ) : null}

        <details className="soft-details" open={client.waitlist.length === 0}>
          <summary className="button secondary">Добавить себя в лист ожидания</summary>
          <form action={joinWaitlist} className="grid waitlist-form">
            <input type="hidden" name="clientToken" value={token} />
            <label className="radio-card">
              <input type="radio" name="waitMode" value="NEAREST" defaultChecked />
              <span><b>Ближайшее свободное окно</b><br /><small>Подойдёт, если главное — попасть пораньше.</small></span>
            </label>
            <label className="radio-card">
              <input type="radio" name="waitMode" value="DATES" />
              <span><b>Конкретные даты</b><br /><small>Можно отметить несколько дней на ближайшие два месяца.</small></span>
            </label>
            <details className="soft-details nested">
              <summary>Показать даты</summary>
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
              <textarea name="note" placeholder="Например: могу вечером / лучше после 15:00 / нужен ремонт одного ногтя" />
            </label>
            <button>Отправить в лист ожидания</button>
          </form>
        </details>
      </section>

      {historyBookings.length ? (
        <section className="card">
          <h2>История</h2>
          <div className="booking-card-list history-list">
            {historyBookings.slice(0, 12).map((booking) => (
              <article className="booking-card muted-card" key={booking.id}>
                <div>
                  <span className={statusClass(booking.status)}>{statusText(booking.status)}</span>
                  <h3>{formatDateTime(booking.startAt)}</h3>
                  <p>{booking.service.title} · {rub(booking.finalPrice ?? booking.service.price)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
