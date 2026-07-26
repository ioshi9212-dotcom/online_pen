import { cancelClientBooking, cancelWaitlistEntry, joinWaitlist, rememberClientBooking } from "@/app/actions";
import ClientBookingPicker, { BookingServiceOption, BookingWindow } from "@/app/ClientBookingPicker";
import { bookingDisplayTitle } from "@/lib/bookingDisplay";
import { canRememberBooking, CLIENT_REMEMBER_MARK, hasBookingMark, rememberOpensLabel, timeUntilBookingLabel } from "@/lib/bookingRemember";
import { getClientCookie } from "@/lib/clientSession";
import { rub } from "@/lib/format";
import { getOnlineBookingMinStart } from "@/lib/onlineBookingCutoff";
import { prisma } from "@/lib/prisma";
import { combineDateAndTime, getEffectiveDay, overlaps } from "@/lib/schedule";
import { businessDateKey, formatInBusinessTime } from "@/lib/timezone";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  client?: string;
  date?: string;
  created?: string;
  waitlist?: string;
  cancelled?: string;
  remembered?: string;
  rememberError?: string;
  reschedule?: string;
  profileSaved?: string;
  login?: string;
  busy?: string;
  bookingError?: string;
};

type WaitlistItem = { id: string; mode: string; desiredDates: string; note: string | null };

function upperFirst(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.charAt(1).toLowerCase() + text.slice(2) : text;
}

function fmtDate(date: Date) {
  return upperFirst(formatInBusinessTime(date, { day: "numeric", month: "long", weekday: "long" }));
}

function fmtTime(date: Date) {
  return formatInBusinessTime(date, { hour: "2-digit", minute: "2-digit" });
}

function noticeText(searchParams: SearchParams) {
  if (searchParams.profileSaved) return "Профиль сохранён.";
  if (searchParams.created) return "Время временно за вами. Мастер проверяет заявку на запись.";
  if (searchParams.remembered) return "Спасибо. Мастер видит, что вы планируете прийти.";
  if (searchParams.rememberError === "early") return "Отметка «Я приду» появится с 9:00 за день до визита.";
  if (searchParams.waitlist === "cancelled") return "Вы вышли из листа ожидания.";
  if (searchParams.waitlist === "nearest") return "Мастер увидит, что вы ждёте ближайшее свободное окно.";
  if (searchParams.waitlist === "dates") return "Выбранные даты добавлены в лист ожидания.";
  if (searchParams.reschedule) return "Предыдущая запись отменена. Выберите новое время.";
  if (searchParams.cancelled) return "Запись отменена.";
  if (searchParams.login) return "Вы вошли в кабинет.";
  if (searchParams.busy) return "Это время только что заняли или услуга не помещается. Выберите другое.";
  if (searchParams.bookingError === "service") return "Услуга больше недоступна. Выберите другую.";
  if (searchParams.bookingError === "time") return "Не удалось прочитать выбранное время. Выберите его ещё раз.";
  return "";
}

function statusText(status: string) {
  if (status === "PENDING") return "Мастер проверяет";
  if (status === "CONFIRMED") return "Запись подтверждена";
  if (status === "COMPLETED") return "Завершена";
  if (status === "CANCELLED_BY_CLIENT") return "Отменена вами";
  if (status === "CANCELLED_BY_ADMIN") return "Отменена мастером";
  if (status === "REJECTED") return "Не подтверждена";
  return status;
}

function statusClass(status: string) {
  if (status === "PENDING") return "client-v2-status is-waiting";
  if (status === "CONFIRMED") return "client-v2-status is-confirmed";
  if (["CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED"].includes(status)) return "client-v2-status is-cancelled";
  return "client-v2-status";
}

function waitlistDates(entry: WaitlistItem) {
  if (entry.mode !== "DATES") return [];
  try {
    return (JSON.parse(entry.desiredDates || "[]") as string[]).filter(Boolean);
  } catch {
    return [];
  }
}

function waitlistDescription(entry: WaitlistItem) {
  const dates = waitlistDates(entry);
  if (entry.mode === "DATES" && dates.length) {
    return dates
      .map((date) => new Date(`${date}T00:00:00`))
      .map((date) => formatInBusinessTime(date, { day: "2-digit", month: "2-digit", year: "numeric" }))
      .join(", ");
  }
  return entry.mode === "DATES" ? "Даты пока не выбраны" : "Ближайшее подходящее окно";
}

function buildServiceOptions(services: Array<{
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  price: number;
}>): BookingServiceOption[] {
  const options: BookingServiceOption[] = services.map((service) => ({ ...service, isBundle: false }));
  const hasReadyBundle = services.some((service) => /маникюр/i.test(service.title) && /педикюр/i.test(service.title));
  if (hasReadyBundle) return options;

  const manicure = services.find((service) => /маникюр/i.test(service.title) && !/педикюр/i.test(service.title));
  const pedicure = services.find((service) => /педикюр/i.test(service.title));
  if (!manicure || !pedicure) return options;

  options.splice(Math.min(2, options.length), 0, {
    id: `bundle:${manicure.id},${pedicure.id}`,
    title: "Маникюр + педикюр",
    description: "Одна заявка на длинный визит. Сайт сам найдёт время, куда поместятся обе услуги.",
    durationMinutes: manicure.durationMinutes + pedicure.durationMinutes,
    price: manicure.price + pedicure.price,
    isBundle: true
  });
  return options;
}

export default async function MyPage({ searchParams }: { searchParams: SearchParams }) {
  const token = getClientCookie();
  if (!token) redirect(searchParams.client ? "/login?error=session-required" : "/login");

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

  const [bookableServices, priceServices, onlineWindows, busyBookings, blockedSlots, scheduleRules, dayOverrides] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true, showInBooking: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: onlineMinStart } }, orderBy: { startAt: "asc" }, take: 120 }),
    prisma.booking.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, endAt: { gt: onlineMinStart } },
      select: { startAt: true, endAt: true }
    }),
    prisma.blockedSlot.findMany({
      where: { endAt: { gt: onlineMinStart } },
      select: { startAt: true, endAt: true }
    }),
    prisma.scheduleRule.findMany({ orderBy: { weekday: "asc" } }),
    prisma.dayOverride.findMany({ where: { date: { gte: onlineMinStart } }, orderBy: { date: "asc" } })
  ]);

  const serviceOptions = buildServiceOptions(bookableServices);
  const windows: BookingWindow[] = onlineWindows.map((window) => {
    const effectiveDay = getEffectiveDay(window.startAt, scheduleRules, dayOverrides);
    const dayEnd = combineDateAndTime(window.startAt, effectiveDay.endTime);
    const availableServiceIds = serviceOptions
      .filter((service) => {
        const endAt = new Date(window.startAt.getTime() + service.durationMinutes * 60_000);
        if (endAt > dayEnd) return false;
        const hasBooking = busyBookings.some((booking) => overlaps(window.startAt, endAt, booking.startAt, booking.endAt));
        const hasBlock = blockedSlots.some((slot) => overlaps(window.startAt, endAt, slot.startAt, slot.endAt));
        return !hasBooking && !hasBlock;
      })
      .map((service) => service.id);

    return {
      id: window.id,
      startAt: window.startAt.toISOString(),
      availableServiceIds
    };
  });

  const initialService = serviceOptions[0];
  const firstAvailableWindow = initialService
    ? windows.find((window) => window.availableServiceIds.includes(initialService.id))
    : undefined;
  const initialDate = searchParams.date
    || (firstAvailableWindow ? businessDateKey(firstAvailableWindow.startAt) : businessDateKey(new Date()));

  const now = new Date();
  const activeBookings = client.bookings.filter((booking) => ["PENDING", "CONFIRMED"].includes(booking.status) && booking.startAt > now);
  const upcomingBooking = activeBookings[0];
  const pastBookings = client.bookings.filter((booking) => !["PENDING", "CONFIRMED"].includes(booking.status));
  const note = noticeText(searchParams);
  const canClientRemember = upcomingBooking ? canRememberBooking(upcomingBooking.startAt, now) : false;
  const clientRemembered = upcomingBooking ? hasBookingMark(upcomingBooking.clientComment, CLIENT_REMEMBER_MARK) : false;

  return (
    <main className="client-v2 client-booking-page">
      {note ? (
        <div className={`client-v2-flash ${searchParams.busy || searchParams.bookingError || searchParams.rememberError ? "is-error" : "is-success"}`} role="status">
          {note}
        </div>
      ) : null}

      <section className="client-v2-intro">
        <div>
          <span className="client-v2-kicker">Личный кабинет</span>
          <h1>{client.firstName}, выберите удобное время</h1>
          <p>Сначала услуга — тогда календарь покажет только те окна, куда она действительно помещается.</p>
        </div>
        <span className="client-v2-test-badge">Тестовая запись</span>
      </section>

      {upcomingBooking ? (
        <section className="client-v2-upcoming" id="upcoming-booking">
          <div className="client-v2-upcoming-main">
            <span>Ближайшая запись</span>
            <h2>{bookingDisplayTitle(upcomingBooking.service.title, upcomingBooking.clientComment)}</h2>
            <strong>{fmtDate(upcomingBooking.startAt)}, {fmtTime(upcomingBooking.startAt)}</strong>
            <small>{timeUntilBookingLabel(upcomingBooking.startAt, now)}</small>
          </div>
          <div className="client-v2-upcoming-side">
            <span className={statusClass(upcomingBooking.status)}>{statusText(upcomingBooking.status)}</span>
            {clientRemembered ? (
              <p>Вы отметили, что придёте.</p>
            ) : canClientRemember ? (
              <form action={rememberClientBooking}>
                <input type="hidden" name="bookingId" value={upcomingBooking.id} />
                <button type="submit">Я приду</button>
              </form>
            ) : (
              <p>Отметка «Я приду» появится {rememberOpensLabel(upcomingBooking.startAt)}.</p>
            )}
          </div>
          <div className="client-v2-upcoming-actions">
            <form action={cancelClientBooking} data-confirm="Отменить запись? Мастер увидит отмену, а окно освободится.">
              <input type="hidden" name="bookingId" value={upcomingBooking.id} />
              <button type="submit" className="client-v2-button is-quiet">Отменить</button>
            </form>
            <form action={cancelClientBooking} data-confirm="Текущая запись отменится, после чего можно будет выбрать новое время. Продолжить?">
              <input type="hidden" name="bookingId" value={upcomingBooking.id} />
              <input type="hidden" name="afterCancel" value="reschedule" />
              <button type="submit" className="client-v2-button is-secondary">Перенести</button>
            </form>
          </div>
        </section>
      ) : null}

      <ClientBookingPicker
        client={{ firstName: client.firstName, lastName: client.lastName, phone: client.phone }}
        services={serviceOptions}
        windows={windows}
        initialDate={initialDate}
      />

      <section className="client-v2-secondary-grid">
        <details className="client-v2-details" open={activeBookings.length > 1}>
          <summary>
            <span><small>{activeBookings.length} активных</small><b>Мои записи</b></span>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="client-v2-details-body">
            {activeBookings.length === 0 ? <p className="client-v2-empty">Активных записей пока нет.</p> : (
              activeBookings.map((booking) => (
                <article className="client-v2-booking-row" key={booking.id}>
                  <div>
                    <b>{bookingDisplayTitle(booking.service.title, booking.clientComment)}</b>
                    <span>{fmtDate(booking.startAt)}, {fmtTime(booking.startAt)}</span>
                  </div>
                  <span className={statusClass(booking.status)}>{statusText(booking.status)}</span>
                  <form action={cancelClientBooking} data-confirm="Отменить запись?">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button className="client-v2-button is-quiet" type="submit">Отменить</button>
                  </form>
                </article>
              ))
            )}
          </div>
        </details>

        <details className="client-v2-details" id="waitlist">
          <summary>
            <span><small>если нужного времени нет</small><b>Лист ожидания</b></span>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="client-v2-details-body">
            <form action={joinWaitlist} className="client-v2-form">
              <label>Как искать окно
                <select name="waitMode">
                  <option value="NEAREST">Ближайшее свободное</option>
                  <option value="DATES">На конкретные даты</option>
                </select>
              </label>
              <div className="client-v2-date-list">
                <label>Дата 1<input name="desiredDates" type="date" /></label>
                <label>Дата 2<input name="desiredDates" type="date" /></label>
                <label>Дата 3<input name="desiredDates" type="date" /></label>
              </div>
              <label>Комментарий<textarea name="note" placeholder="Например: могу после 16:00" /></label>
              <button type="submit">Добавить в лист ожидания</button>
            </form>

            {client.waitlist.map((entry) => (
              <article className="client-v2-waiting-row" key={entry.id}>
                <div><b>{waitlistDescription(entry)}</b>{entry.note ? <span>{entry.note}</span> : null}</div>
                <form action={cancelWaitlistEntry}>
                  <input type="hidden" name="waitlistId" value={entry.id} />
                  <button className="client-v2-button is-quiet" type="submit">Убрать</button>
                </form>
              </article>
            ))}
          </div>
        </details>

        <details className="client-v2-details">
          <summary>
            <span><small>{priceServices.length} позиций</small><b>Прайс</b></span>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="client-v2-details-body client-v2-price-list">
            {priceServices.map((service) => (
              <article key={service.id}>
                <div><b>{service.title}</b>{service.description ? <span>{service.description}</span> : null}</div>
                <strong>{rub(service.price)}</strong>
              </article>
            ))}
          </div>
        </details>

        <section className="client-v2-profile-card" id="profile">
          <div className="client-v2-avatar">
            {client.avatarUrl ? <img src={client.avatarUrl} alt="" /> : <span>{client.firstName.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div><small>Ваш профиль</small><b>{client.firstName} {client.lastName}</b><span>{client.phone}</span></div>
          <a className="client-v2-button is-secondary" href="/profile">Изменить</a>
        </section>
      </section>

      {pastBookings.length ? (
        <details className="client-v2-details client-v2-history" id="history">
          <summary>
            <span><small>{pastBookings.length} записей</small><b>История</b></span>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="client-v2-details-body">
            {pastBookings.slice(0, 8).map((booking) => (
              <p key={booking.id}>{fmtDate(booking.startAt)} — {bookingDisplayTitle(booking.service.title, booking.clientComment)} — {statusText(booking.status)}</p>
            ))}
          </div>
        </details>
      ) : null}
    </main>
  );
}
