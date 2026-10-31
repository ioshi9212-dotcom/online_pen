import { getEffectiveDay } from "@/lib/schedule";
import { fitsWindow } from "@/lib/availability";
import SubmitButton from "@/app/SubmitButton";
import { cancelClientBooking, cancelWaitlistEntry, joinWaitlist, rememberClientBooking } from "@/app/actions";
import ClientBookingPicker from "@/app/ClientBookingPicker";
import { canRememberBooking, CLIENT_REMEMBER_MARK, hasBookingMark, rememberOpensLabel, timeUntilBookingLabel } from "@/lib/bookingRemember";
import { getOnlineBookingMinStart } from "@/lib/onlineBookingCutoff";
import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";
import { getClientCookie } from "@/lib/clientSession";
import { businessDateKey, businessDateFromKey, businessDateTimeFromKeyAndTime, formatInBusinessTime } from "@/lib/timezone";
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
  rescheduleError?: string;
  waitlistError?: string;
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
  if (searchParams.profileSaved) return "Профиль сохранён.";
  if (searchParams.created) return "Заявка отправлена. Окно занято за вами, ждите подтверждения мастера.";
  if (searchParams.remembered) return "Отметила: вы помните про запись. Мастер теперь тоже видит эту отметку.";
  if (searchParams.rememberError === "early") return "Кнопка подтверждения появится только с 9:00 за день до записи.";
  if (searchParams.waitlist === "cancelled") return "Вы отменили лист ожидания.";
  if (searchParams.waitlist === "nearest") return "Заявка отправлена на ближайшее свободное окно. Мастер увидит ваше пожелание.";
  if (searchParams.waitlist === "dates") return "Заявка с выбранными датами отправлена. Мастер увидит ваши пожелания.";
  if (searchParams.rescheduleError) return "Перенос недоступен: запись уже изменилась.";
  if (searchParams.waitlistError) return "Выберите дату для листа ожидания.";
  if (searchParams.reschedule) return "Выберите новое время. Прежняя запись сохранится до успешной отправки новой заявки.";
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

export default async function MyPage({ searchParams: searchParamsPromise }: { searchParams: Promise<SearchParams> }) {
  const searchParams = (await searchParamsPromise) || {};

  const token = await getClientCookie();
  if (!token) redirect("/login");
  if (searchParams.client) redirect("/my");

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

  const rescheduling = searchParams.reschedule ? client.bookings.find((booking) => booking.id === searchParams.reschedule && ["PENDING", "CONFIRMED"].includes(booking.status) && booking.startAt > new Date()) : undefined;
  if (searchParams.reschedule && !rescheduling) redirect("/my?rescheduleError=1");
  const [bookableServices, priceServices, onlineWindows, busyBookings, blockedSlots, rules, overrides] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true, showInBooking: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: onlineMinStart } }, orderBy: { startAt: "asc" }, take: 300 }),
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] }, endAt: { gt: onlineMinStart }, ...(rescheduling ? { id: { not: rescheduling.id } } : {}) }, select: { startAt: true, endAt: true } }),
    prisma.blockedSlot.findMany({ where: { endAt: { gt: onlineMinStart } }, select: { startAt: true, endAt: true } }),
    prisma.scheduleRule.findMany(),
    prisma.dayOverride.findMany({ where: { date: { gte: businessDateFromKey(businessDateKey(onlineMinStart)) } } })
  ]);
  const windows = onlineWindows.map((window) => {
    const day = getEffectiveDay(window.startAt, rules, overrides);
    const key = businessDateKey(window.startAt);
    const until = businessDateTimeFromKeyAndTime(key, day.endTime);
    const availableServiceIds = day.isWorkingDay && window.startAt >= businessDateTimeFromKeyAndTime(key, day.startTime)
      ? bookableServices.filter((service) => fitsWindow(window.startAt, service.durationMinutes, [...busyBookings, ...blockedSlots], until)).map((service) => service.id) : [];
    return { id: window.id, startAt: window.startAt.toISOString(), busy: availableServiceIds.length === 0, availableServiceIds };
  });

  const firstFreeWindow = windows.find((window) => !window.busy);
  const firstAvailableDate = firstFreeWindow ? dayKey(new Date(firstFreeWindow.startAt)) : dayKey(new Date());
  const initialDate = searchParams.date || firstAvailableDate;
  const initialTime = searchParams.time || "";
  const now = new Date();
  const activeBookings = client.bookings.filter((booking) => ["PENDING", "CONFIRMED"].includes(booking.status) && booking.endAt > now);
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
          <b>Сайт в тестовом режиме</b>
          <p>После записи напишите мастеру для проверки.</p>
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
                <p><b>Вы помните про запись.</b> Мастер видит вашу отметку.</p>
              ) : canClientRemember ? (
                <p><b>Отметьте, что помните про запись.</b> Это ваша отметка «Я приду». Саму запись подтверждает мастер.</p>
              ) : (
                <p>Кнопка «Помню про запись» появится {rememberOpensLabel(upcomingBooking.startAt)}.</p>
              )}
            </div>

            <div className="upcoming-booking-actions">
              {canClientRemember && !clientRemembered ? (
                <form action={rememberClientBooking}>
                  <input type="hidden" name="bookingId" value={upcomingBooking.id} />
                  <SubmitButton>Помню про запись</SubmitButton>
                </form>
              ) : null}
              <form action={cancelClientBooking} data-confirm="Отменить запись? Окно освободится, мастер увидит отмену.">
                <input type="hidden" name="bookingId" value={upcomingBooking.id} />
                <SubmitButton className="danger">Отменить</SubmitButton>
              </form>
              <a className="button secondary" href={`/my?reschedule=${upcomingBooking.id}#windows`}>Перенести</a>
            </div>
          </section>
        ) : null}
      </section>

      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>{rescheduling ? "Перенести запись" : "Записаться"}</h1>
        {rescheduling ? <a className="button secondary" href="/my">Оставить прежнюю запись</a> : null}
        <p className="lead">{client.firstName}, выберите услугу и подходящее время. Дополнения укажите в комментарии.</p>
      </section>

      <section className="info-cards instruction-cards">
        <article className="info-card"><h3>1. Услуга</h3><p>Выберите основную услугу.</p></article>
        <article className="info-card"><h3>2. Время</h3><p>Сайт покажет окна подходящей длительности.</p></article>
        <article className="info-card"><h3>3. Заявка</h3><p>Проверьте данные и дождитесь подтверждения мастера.</p></article>
      </section>

      <ClientBookingPicker
        rescheduleId={rescheduling?.id}
        initialServiceId={rescheduling?.serviceId}
        client={{ firstName: client.firstName, lastName: client.lastName, phone: client.phone }}
        services={bookableServices.map((service) => ({ id: service.id, title: service.title, price: service.price, durationMinutes: service.durationMinutes, description: service.description }))}
        windows={windows}
        initialDate={initialDate}
        initialTime={initialTime}
        todayDate={businessDateKey(now)}
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
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <SubmitButton className="secondary">Отменить запись</SubmitButton>
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
            <label>Как искать окно<select name="waitMode"><option value="NEAREST">Ближайшее свободное</option><option value="DATES">Конкретные даты</option></select></label>
            <label>Даты, если нужны конкретные<input name="desiredDates" type="date" /></label>
            <label>Комментарий<textarea name="note" placeholder="Например: могу после 16:00, кроме пятницы" /></label>
            <SubmitButton>Встать в лист ожидания</SubmitButton>
          </form>

          {client.waitlist.length ? (
            <div className="grid waitlist-active-list">
              {client.waitlist.map((entry) => (
                <article className="mini-card" key={entry.id}>
                  <h3>{waitlistTitle(entry)}</h3>
                  <p>{waitlistDescription(entry)}</p>
                  {entry.note ? <p className="muted">Комментарий: {entry.note}</p> : null}
                  <form action={cancelWaitlistEntry} data-confirm="Убрать пожелание из листа ожидания?">
                    <input type="hidden" name="waitlistId" value={entry.id} />
                    <SubmitButton className="secondary">Убрать из ожидания</SubmitButton>
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
            <a className="button secondary" href="/profile">Редактировать профиль</a>
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
