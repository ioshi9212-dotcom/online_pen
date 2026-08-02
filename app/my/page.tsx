import { cancelClientBooking, cancelWaitlistEntry, joinWaitlist, rememberClientBooking } from "@/app/actions";
import ClientBookingPicker from "@/app/ClientBookingPicker";
import { canRememberBooking, CLIENT_REMEMBER_MARK, hasBookingMark, rememberOpensLabel, timeUntilBookingLabel } from "@/lib/bookingRemember";
import { getOnlineBookingMinStart } from "@/lib/onlineBookingCutoff";
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
  remembered?: string;
  rememberError?: string;
  reschedule?: string;
  profileSaved?: string;
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
  if (searchParams.profileSaved) return "Профиль сохранён. Фото тоже, если сайт опять не решил стать драмой.";
  if (searchParams.created) return "Заявка отправлена. Окно занято за вами, ждите подтверждения мастера.";
  if (searchParams.remembered) return "Отметила: вы помните про запись. Мастер теперь тоже видит эту отметку.";
  if (searchParams.rememberError === "early") return "Кнопка подтверждения появится только с 9:00 за день до записи.";
  if (searchParams.waitlist === "cancelled") return "Вы отменили лист ожидания.";
  if (searchParams.waitlist === "nearest") return "Заявка отправлена на ближайшее свободное окно. Мастер увидит ваше пожелание.";
  if (searchParams.waitlist === "dates") return "Заявка с выбранными датами отправлена. Мастер увидит ваши пожелания.";
  if (searchParams.reschedule) return "Старая запись отменена. Теперь можно выбрать новое время.";
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

  const settings = await prisma.setting.findMany();
  const onlineMinStart = getOnlineBookingMinStart(settings);

  const [bookableServices, priceServices, onlineWindows, busyBookings] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true, showInBooking: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: onlineMinStart } }, orderBy: { startAt: "asc" }, take: 120 }),
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gte: onlineMinStart } }, include: { service: true } })
  ]);

  const busyStartSet = new Set<string>();
  const windows = onlineWindows.map((window) => {
    const fallbackEndAt = new Date(window.startAt.getTime() + 30 * 60_000);
    const busy = busyBookings.some((booking) => overlaps(window.startAt, fallbackEndAt, booking.startAt, booking.endAt));
    if (busy) busyStartSet.add(window.startAt.toISOString());
    return {
      id: window.id,
      startAt: window.startAt.toISOString(),
      busy
    };
  });

  const existingWindowStarts = new Set(windows.map((window) => window.startAt));
  for (const booking of busyBookings) {
    const startIso = booking.startAt.toISOString();
    if (!existingWindowStarts.has(startIso)) {
      windows.push({ id: `busy-${booking.id}`, startAt: startIso, busy: true });
      existingWindowStarts.add(startIso);
      busyStartSet.add(startIso);
    }
  }
  windows.sort((a, b) => a.startAt.localeCompare(b.startAt));

  const firstFreeWindow = windows.find((window) => !window.busy);
  const firstAvailableDate = firstFreeWindow ? dayKey(new Date(firstFreeWindow.startAt)) : dayKey(new Date());
  const initialDate = searchParams.date || firstAvailableDate;
  const initialTime = "";
  const now = new Date();
  const activeBookings = client.bookings.filter((booking) => ["PENDING", "CONFIRMED"].includes(booking.status) && booking.startAt > now);
  const upcomingBooking = activeBookings[0];
  const pastBookings = client.bookings.filter((booking) => !["PENDING", "CONFIRMED"].includes(booking.status));
  const note = noticeText(searchParams);
  const canClientRemember = upcomingBooking ? canRememberBooking(upcomingBooking.startAt, now) : false;
  const clientRemembered = upcomingBooking ? hasBookingMark(upcomingBooking.clientComment, CLIENT_REMEMBER_MARK) : false;

  return (
    <main className={`page client-page client-page-compact ${styles.clientPageCompact}`}>
      {note ? <div className={searchParams.busy || searchParams.bookingError || searchParams.rememberError ? "notice danger-notice" : "notice ok-status"}>{note}</div> : null}

      <section className="client-top-stack" aria-label="Важное">
        <div className="notice client-start-warning">
          <b>Онлайн-запись работает в тестовом режиме.</b>
          <p>Сайт уже почти самостоятельный, но я всё равно проверяю записи руками. Если записались — лучше напишите мне. Робот молодец, но без присмотра пока не герой.</p>
        </div>

        {upcomingBooking ? (
          <section className="card upcoming-booking-card" id="upcoming-booking">
            <div className="upcoming-booking-head">
              <div>
                <p className="muted">Ближайшая запись</p>
                <h2>{upcomingBooking.service.title}</h2>
                <p>{fmtDate(upcomingBooking.startAt)} в {fmtTime(upcomingBooking.startAt)}</p>
                <p className="booking-countdown">{timeUntilBookingLabel(upcomingBooking.startAt, now)}</p>
              </div>
              <span className={statusClass(upcomingBooking.status)}>{statusText(upcomingBooking.status)}</span>
            </div>

            <div className="upcoming-booking-note">
              {clientRemembered ? (
                <p><b>Вы отметили, что помните про запись.</b> Отлично, сайт выдохнул, мастер увидит отметку.</p>
              ) : canClientRemember ? (
                <p><b>Подтвердите, что помните про запись.</b> Кнопка доступна с 9:00 за день до визита. Это не подтверждение мастера, а ваша отметка: «да, я приду».</p>
              ) : (
                <p><b>Кнопка «Помню про запись» появится {rememberOpensLabel(upcomingBooking.startAt)}.</b> Раньше не показываю, чтобы никто не подтверждал запись за сто лет до события и потом не забывал, как обычно делают взрослые люди.</p>
              )}
            </div>

            <div className="upcoming-booking-actions">
              {canClientRemember && !clientRemembered ? (
                <form action={rememberClientBooking}>
                  <input type="hidden" name="clientToken" value={token} />
                  <input type="hidden" name="bookingId" value={upcomingBooking.id} />
                  <button type="submit">Помню про запись</button>
                </form>
              ) : null}
              <form action={cancelClientBooking} data-confirm="Отменить запись? Окно освободится, мастер увидит отмену.">
                <input type="hidden" name="clientToken" value={token} />
                <input type="hidden" name="bookingId" value={upcomingBooking.id} />
                <button type="submit" className="danger">Отменить</button>
              </form>
              <form action={cancelClientBooking} data-confirm="Перенос отменит текущую запись и откроет выбор нового времени. Продолжить?">
                <input type="hidden" name="clientToken" value={token} />
                <input type="hidden" name="bookingId" value={upcomingBooking.id} />
                <input type="hidden" name="afterCancel" value="reschedule" />
                <button type="submit" className="secondary">Перенести</button>
              </form>
            </div>
          </section>
        ) : null}
      </section>

      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>Свободные окна и запись</h1>
        <p className="lead">{client.firstName}, сначала найдите удобное время, затем отметьте основную услугу. Допы можно написать в комментарии.</p>
      </section>

      <section className="client-note-stack" aria-label="Важные подсказки">
        <div className="notice combo-service-note">
          <b>Маникюр + педикюр в один день.</b>
          <p>Шаг записи — 2,5 часа. Для двух услуг выбирайте два соседних свободных времени: например, маникюр на 12:00 и педикюр на 14:30. Это не значит, что вы будете сидеть и ждать до 14:30 — мастер просто увидит, что нужно оставить под вас длинное окно.</p>
          <p>Если свободно 12:00, а следующее только 17:00, значит середина уже занята: маникюр и педикюр вместе в это окно не влезают, как бы сайт ни делал вид, что он оптимист.</p>
        </div>
      </section>

      <section className="info-cards instruction-cards">
        <article className="info-card"><h3>1. Найдите время</h3><p>В календаре откройте день или переключитесь на список всех ближайших окон. Розовая точка — есть свободное, серая — есть занятое.</p></article>
        <article className="info-card"><h3>2. Отметьте услугу</h3><p>После выбора времени отметьте одну основную услугу компактным переключателем.</p></article>
        <article className="info-card"><h3>3. Отправьте</h3><p>Окно сразу закрепится за вами и пропадёт у других клиентов. Останется дождаться подтверждения мастера.</p></article>
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
                <div><h3>{booking.service.title}</h3><p>{fmtDate(booking.startAt)} в {fmtTime(booking.startAt)}</p><p className="booking-countdown">{timeUntilBookingLabel(booking.startAt, now)}</p></div>
                <span className={statusClass(booking.status)}>{statusText(booking.status)}</span>
                <form action={cancelClientBooking} data-confirm="Отменить запись? Окно освободится, мастер увидит отмену.">
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

      <section className="card client-profile-card" id="profile">
        <div className="profile-avatar-upload">
          <div className="avatar-preview profile-avatar-preview">
            {client.avatarUrl ? <img src={client.avatarUrl} alt="Фото клиента" /> : <span>{client.firstName.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div>
            <h2>Профиль</h2>
            <p>{client.firstName} {client.lastName}</p>
            <p>{client.phone}</p>
            <a className="button secondary" href={`/profile?client=${token}`}>Редактировать профиль</a>
          </div>
        </div>
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
