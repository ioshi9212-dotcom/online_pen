import { cancelClientBooking, cancelWaitlistEntry, joinWaitlist } from "@/app/actions";
import ClientBookingPicker from "@/app/ClientBookingPicker";
import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";
import { getClientCookie } from "@/lib/clientSession";
import { businessDateKey, formatInBusinessTime } from "@/lib/timezone";
import { redirect } from "next/navigation";
import styles from "./my-page-compact.module.css";

export const dynamic = "force-dynamic";

type SearchParams = {
  client?: string;
  date?: string;
  time?: string;
  created?: string;
  waitlist?: string;
  cancelled?: string;
  login?: string;
  known?: string;
  busy?: string;
  bookingError?: string;
};

type WaitlistItem = { id: string; mode: string; desiredDates: string; note: string | null };

function upperFirst(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function fmtDate(date: Date) {
  return upperFirst(formatInBusinessTime(date, { day: "numeric", month: "long", weekday: "long" }));
}

function fmtTime(date: Date) {
  return formatInBusinessTime(date, { hour: "2-digit", minute: "2-digit" });
}

function dayKey(date: Date) {
  return businessDateKey(date);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

function noticeText(searchParams: SearchParams) {
  if (searchParams.created) return "Заявка отправлена. Окно занято за вами, ждите подтверждения мастера.";
  if (searchParams.waitlist === "cancelled") return "Вы отменили лист ожидания.";
  if (searchParams.waitlist === "nearest") return "Заявка отправлена на ближайшее свободное окно. Мастер увидит ваше пожелание.";
  if (searchParams.waitlist === "dates") return "Заявка с выбранными датами отправлена. Мастер увидит ваши пожелания.";
  if (searchParams.cancelled) return "Запись отменена.";
  if (searchParams.login) return "Вход выполнен.";
  if (searchParams.known) return "Вы уже есть в базе. Можно записываться.";
  if (searchParams.busy) return "Это окно уже заняли или оно не подходит по длительности. Выберите другое.";
  if (searchParams.bookingError === "service") return "Выберите основную услугу, доступную для записи.";
  return "";
}

function statusText(status: string) {
  if (status === "PENDING") return "Ожидает подтверждения";
  if (status === "CONFIRMED") return "Подтверждено";
  if (status === "COMPLETED") return "Завершена";
  if (status === "CANCELLED_BY_CLIENT") return "Отменена вами";
  if (status === "CANCELLED_BY_ADMIN") return "Отменена мастером";
  if (status === "REJECTED") return "Отклонена";
  return status;
}

function statusClass(status: string) {
  if (status === "PENDING") return "status wait";
  if (status === "CONFIRMED") return "status ok";
  if (["CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED"].includes(status)) return "status danger-status";
  return "status";
}

function waitlistDates(entry: WaitlistItem) {
  if (entry.mode !== "DATES") return [];
  try {
    return (JSON.parse(entry.desiredDates || "[]") as string[]).filter(Boolean);
  } catch {
    return [];
  }
}

function waitlistTitle(entry: WaitlistItem) {
  return entry.mode === "DATES" ? "Ожидание на конкретные даты" : "Ожидание ближайшего окна";
}

function waitlistDescription(entry: WaitlistItem) {
  const dates = waitlistDates(entry);
  if (entry.mode === "DATES" && dates.length) {
    return `Выбранные даты: ${dates.map((date) => new Date(`${date}T00:00:00`)).map((date) => formatInBusinessTime(date, { day: "2-digit", month: "2-digit", year: "numeric" })).join(", ")}`;
  }
  if (entry.mode === "DATES") return "Конкретные даты пока не выбраны.";
  return "Мастер увидит, что вы готовы прийти в ближайшее освободившееся окно.";
}

export default async function MyPage({ searchParams }: { searchParams: SearchParams }) {
  const token = searchParams.client || getClientCookie();
  if (!token) redirect("/login");
  if (!searchParams.client) redirect(`/my?client=${token}`);

  const client = await prisma.client.findUnique({
    where: { publicToken: token },
    include: {
      bookings: { include: { service: true }, orderBy: { startAt: "asc" } },
      waitlist: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } }
    }
  });

  if (!client) redirect("/login");
  if (client.status !== "APPROVED") redirect("/unavailable");

  const [bookableServices, priceServices, onlineWindows, busyBookings] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true, showInBooking: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 120 }),
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gte: new Date() } }, include: { service: true } })
  ]);

  const windows = onlineWindows.map((window) => {
    const fallbackEndAt = new Date(window.startAt.getTime() + 30 * 60_000);
    const busy = busyBookings.some((booking) => overlaps(window.startAt, fallbackEndAt, booking.startAt, booking.endAt));
    return {
      id: window.id,
      startAt: window.startAt.toISOString(),
      busy
    };
  });

  const firstFreeWindow = windows.find((window) => !window.busy);
  const firstAvailableDate = firstFreeWindow ? dayKey(new Date(firstFreeWindow.startAt)) : dayKey(new Date());
  const initialDate = searchParams.date || firstAvailableDate;
  const initialTime = "";
  const activeBookings = client.bookings.filter((booking) => ["PENDING", "CONFIRMED"].includes(booking.status));
  const pastBookings = client.bookings.filter((booking) => !["PENDING", "CONFIRMED"].includes(booking.status));
  const note = noticeText(searchParams);

  return (
    <main className={`page client-page client-page-compact ${styles.clientPageCompact}`}>
      {note ? <div className={searchParams.busy || searchParams.bookingError ? "notice danger-notice" : "notice ok-status"}>{note}</div> : null}

      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>Свободные окна и запись</h1>
        <p className="lead">{client.firstName}, выберите дату, одну основную услугу и время. Допы можно написать в комментарии.</p>
      </section>

      <section className="client-note-stack" aria-label="Важные подсказки">
        <div className="notice test-version-note">
          <b>Сайт в тестовом режиме.</b>
          <p>Он уже почти взрослый, но иногда всё ещё нажимает кнопки как кот по клавиатуре. После отправки заявки напишите мастеру, чтобы она проверила запись вручную.</p>
        </div>
        <div className="notice combo-service-note">
          <b>Маникюр + педикюр в один день.</b>
          <p>Шаг записи — 2,5 часа. Для двух услуг выбирайте два соседних свободных времени: например, маникюр на 12:00 и педикюр на 14:30. Это не значит, что вы будете сидеть и ждать до 14:30 — мастер просто увидит, что нужно оставить под вас длинное окно.</p>
          <p>Если свободно 12:00, а следующее только 17:00, значит середина уже занята: маникюр и педикюр вместе в это окно не влезают, как бы сайт ни делал вид, что он оптимист.</p>
        </div>
      </section>

      <section className="info-cards instruction-cards">
        <article className="info-card"><h3>1. Календарь</h3><p>Серые числа — день недоступен. Белые — можно открыть. Розовая точка — есть свободное место, серая — часть времени уже занята.</p></article>
        <article className="info-card"><h3>2. Услуга</h3><p>Сначала выберите услугу. После кнопки «Выбрать услугу» появится свободное время для этой даты.</p></article>
        <article className="info-card"><h3>3. Заявка</h3><p>Выберите время, проверьте свои данные и отправьте заявку. Окно займётся за вами до ответа мастера.</p></article>
      </section>

      <ClientBookingPicker
        token={token}
        client={{ firstName: client.firstName, lastName: client.lastName, phone: client.phone }}
        services={bookableServices.map((service) => ({ id: service.id, title: service.title, price: service.price, durationMinutes: service.durationMinutes, description: service.description }))}
        windows={windows}
        initialDate={initialDate}
        initialTime={initialTime}
      />

      <section className="card" id="bookings">
        <h2>Мои записи</h2>
        {activeBookings.length === 0 ? <div className="empty-state">Активных записей пока нет.</div> : (
          <div className="grid">
            {activeBookings.map((booking) => (
              <article className="booking-card" key={booking.id}>
                <div><h3>{booking.service.title}</h3><p>{fmtDate(booking.startAt)} в {fmtTime(booking.startAt)}</p></div>
                <span className={statusClass(booking.status)}>{statusText(booking.status)}</span>
                <form action={cancelClientBooking}>
                  <input type="hidden" name="clientToken" value={token} />
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <button className="secondary" type="submit">Отменить запись</button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <details className="card client-collapse-card" id="waitlist">
        <summary className="client-collapse-summary">
          <span>
            <small>{client.waitlist.length ? `${client.waitlist.length} активн.` : "если нужное время занято"}</small>
            <h2>Лист ожидания</h2>
          </span>
          <i aria-hidden="true">⌄</i>
        </summary>
        <div className="client-collapse-body">
          <form action={joinWaitlist} className="grid waitlist-compact-form">
            <input type="hidden" name="clientToken" value={token} />
            <label>Как искать окно<select name="waitMode"><option value="NEAREST">Ближайшее свободное</option><option value="DATES">Конкретные даты</option></select></label>
            <label>Даты, если нужны конкретные<input name="desiredDates" type="date" /></label>
            <label>Комментарий<textarea name="note" placeholder="Например: могу после 16:00, кроме пятницы" /></label>
            <button type="submit">Встать в лист ожидания</button>
          </form>

          {client.waitlist.length ? (
            <div className="grid waitlist-active-list">
              {client.waitlist.map((entry) => (
                <article className="mini-card" key={entry.id}>
                  <h3>{waitlistTitle(entry)}</h3>
                  <p>{waitlistDescription(entry)}</p>
                  {entry.note ? <p className="muted">Комментарий: {entry.note}</p> : null}
                  <form action={cancelWaitlistEntry}>
                    <input type="hidden" name="clientToken" value={token} />
                    <input type="hidden" name="waitlistId" value={entry.id} />
                    <button className="secondary" type="submit">Убрать из ожидания</button>
                  </form>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </details>

      <section className="card price-compact-card" id="price">
        <h2>Прайс</h2>
        <div className="price-list price-compact-list">
          {priceServices.map((service) => (
            <article className="price-row" key={service.id}>
              <div><b>{service.title}</b>{service.description ? <p>{service.description}</p> : null}</div>
              <strong>{rub(service.price)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="card" id="profile">
        <h2>Профиль</h2>
        <p>{client.firstName} {client.lastName}</p>
        <p>{client.phone}</p>
        <a className="button secondary" href={`/profile?client=${token}`}>Редактировать профиль</a>
      </section>

      {pastBookings.length ? (
        <details className="card client-collapse-card" id="history">
          <summary className="client-collapse-summary">
            <span>
              <small>{pastBookings.length} записей</small>
              <h2>История</h2>
            </span>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="client-collapse-body history-compact-list">
            {pastBookings.slice(0, 8).map((booking) => <p key={booking.id}>{fmtDate(booking.startAt)} — {booking.service.title} — {statusText(booking.status)}</p>)}
          </div>
        </details>
      ) : null}
    </main>
  );
}
