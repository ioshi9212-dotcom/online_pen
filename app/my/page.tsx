import { cancelClientBooking, joinWaitlist } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, formatDateTime, formatTimeOnly, rub } from "@/lib/format";
import { generateSlots, getSettingInt } from "@/lib/schedule";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = { client?: string; created?: string; waitlist?: string; cancelled?: string; login?: string; known?: string };
type Slot = { startAt: Date; endAt: Date };

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
  if (status === "CONFIRMED") return "client-status ok";
  if (status === "PENDING") return "client-status wait";
  if (["CANCELLED_BY_CLIENT", "CANCELLED_BY_ADMIN", "REJECTED", "NO_SHOW"].includes(status)) return "client-status danger";
  return "client-status";
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shortDate(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Завтра";

  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function groupSlotsByDate(slots: Slot[]) {
  const map = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = dateKey(slot.startAt);
    const list = map.get(key) || [];
    list.push(slot);
    map.set(key, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
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

function bookingHref(token: string, serviceId: string, key: string, slot: Slot) {
  return `/booking?client=${token}&service=${serviceId}&date=${key}&time=${encodeURIComponent(slot.startAt.toISOString())}#confirm`;
}

function Notice({ type }: { type?: string }) {
  if (type === "created") return <div className="notice ok-notice floating-toast">Заявка отправлена. Окно уже закреплено за вами.</div>;
  if (type === "waitlist") return <div className="notice ok-notice floating-toast">Вы в листе ожидания. Мастер увидит пожелания.</div>;
  if (type === "cancelled") return <div className="notice floating-toast">Запись отменена.</div>;
  if (type === "login") return <div className="notice ok-notice floating-toast">Вход выполнен. Вот ваш кабинет.</div>;
  if (type === "known") return <div className="notice ok-notice floating-toast">Вы уже есть в базе. Можно записываться.</div>;
  return null;
}

function ClientTopbar({ token, name }: { token: string; name: string }) {
  return (
    <header className="client-topbar">
      <a className="client-logo" href={`/my?client=${token}`}><span>O</span><b>Онлайн-запись</b></a>
      <nav>
        <a href="#windows">Окна</a>
        <a href="#price">Прайс</a>
        <a href="#waitlist">Ждуны</a>
        <a href={`/profile?client=${token}`}>Профиль</a>
      </nav>
      <div className="client-mini-avatar">{name.slice(0, 1).toUpperCase()}</div>
    </header>
  );
}

function ActiveBookingCard({ token, bookings }: { token: string; bookings: Array<any> }) {
  const main = bookings[0];

  if (!main) {
    return (
      <section className="client-card client-hero-card no-booking">
        <div>
          <p className="client-eyebrow">Сейчас</p>
          <h2>Активной записи нет</h2>
          <p>Ниже сразу видны ближайшие свободные окна. Выберите время — и сайт доведёт до подтверждения.</p>
        </div>
        <a className="client-button" href="#windows">Выбрать окно</a>
      </section>
    );
  }

  return (
    <section className="client-card client-hero-card active-booking">
      <div>
        <p className="client-eyebrow">Ваша запись</p>
        <h2>{formatDateTime(main.startAt)}</h2>
        <p>{main.service.title} · {rub(main.finalPrice ?? main.service.price)}</p>
        <span className={statusClass(main.status)}>{statusText(main.status)}</span>
        {main.status === "PENDING" ? <p className="client-hint">Окно уже закреплено за вами. Осталось дождаться подтверждения мастера.</p> : null}
      </div>
      <details className="client-danger-details">
        <summary className="client-button secondary">Отменить</summary>
        <form action={cancelClientBooking} className="client-inline-form">
          <input type="hidden" name="clientToken" value={token} />
          <input type="hidden" name="bookingId" value={main.id} />
          <p>Точно отменить эту запись?</p>
          <button className="danger" type="submit">Да, отменить</button>
        </form>
      </details>
    </section>
  );
}

function WaitlistBlock({ token, dates, waitlist }: { token: string; dates: { value: string; label: string }[]; waitlist: Array<any> }) {
  return (
    <section className="client-card" id="waitlist">
      <div className="client-section-head">
        <div>
          <p className="client-eyebrow">Если не подходит время</p>
          <h2>Лист ожидания</h2>
          <p>Можно оставить пожелания. Мастер увидит, если освободится подходящее окно.</p>
        </div>
        {waitlist.length ? <span className="client-status wait">уже в списке</span> : null}
      </div>

      {waitlist.length ? (
        <div className="client-waitlist-current">
          {waitlist.map((entry) => <p key={entry.id}>{waitlistText(entry)}</p>)}
        </div>
      ) : null}

      <details className="client-details" open={waitlist.length === 0}>
        <summary className="client-button secondary">Встать в лист ожидания</summary>
        <form action={joinWaitlist} className="client-form">
          <input type="hidden" name="clientToken" value={token} />
          <div className="client-choice-grid">
            <label><input type="radio" name="waitMode" value="NEAREST" defaultChecked /><span><b>Ближайшее окно</b><small>Подойдёт любое освободившееся время.</small></span></label>
            <label><input type="radio" name="waitMode" value="DATES" /><span><b>Конкретные даты</b><small>Отметьте удобные дни.</small></span></label>
          </div>
          <details className="client-details nested">
            <summary>Выбрать даты</summary>
            <div className="client-date-picks">
              {dates.map((date) => <label key={date.value}><input type="checkbox" name="desiredDates" value={date.value} /><span>{date.label}</span></label>)}
            </div>
          </details>
          <label>Комментарий<textarea name="note" placeholder="Например: могу после 15:00 / только выходные / срочно" /></label>
          <button type="submit">Отправить пожелания</button>
        </form>
      </details>
    </section>
  );
}

export default async function MyPage({ searchParams }: { searchParams: SearchParams }) {
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

  const [services, rules, settings] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.scheduleRule.findMany(),
    prisma.setting.findMany()
  ]);

  const noticeType = searchParams.created ? "created" : searchParams.waitlist ? "waitlist" : searchParams.cancelled ? "cancelled" : searchParams.login ? "login" : searchParams.known ? "known" : undefined;
  const activeBookings = client.bookings.filter((booking) => ["PENDING", "CONFIRMED"].includes(booking.status)).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const historyBookings = client.bookings.filter((booking) => !["PENDING", "CONFIRMED"].includes(booking.status));
  const dates = dateOptions(60);
  const defaultService = services[0];
  const defaultServiceId = defaultService?.id || "";

  const daysAhead = getSettingInt(settings, "booking_days_ahead", 60);
  const stepMinutes = getSettingInt(settings, "slot_step_minutes", getSettingInt(settings, "SLOT_STEP_MINUTES", 30));
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + daysAhead + 1);

  const [bookings, blockedSlots, dayOverrides, onlineWindows] = await Promise.all([
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { lt: horizon } }, select: { startAt: true, endAt: true } }),
    prisma.blockedSlot.findMany({ where: { startAt: { lt: horizon } }, select: { startAt: true, endAt: true } }),
    prisma.dayOverride.findMany(),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: new Date(), lt: horizon } }, select: { startAt: true }, orderBy: { startAt: "asc" } })
  ]);

  const onlineWindowSet = new Set(onlineWindows.map((window) => window.startAt.toISOString()));
  const allSlots = defaultService ? generateSlots({ service: defaultService, rules, bookings, blockedSlots, daysAhead, stepMinutes, dayOverrides }) : [];
  const freeSlots = allSlots.filter((slot) => onlineWindowSet.has(slot.startAt.toISOString()));
  const freeGroups = groupSlotsByDate(freeSlots).slice(0, 7);
  const totalVisibleSlots = freeGroups.reduce((sum, [, slots]) => sum + slots.length, 0);

  return (
    <main className="client-shell">
      <ClientTopbar token={token} name={client.firstName} />
      <Notice type={noticeType} />

      <section className="client-welcome">
        <div>
          <p className="client-eyebrow">Личный кабинет</p>
          <h1>Привет, {client.firstName} ✨</h1>
          <p>Здесь только нужное: ваша запись, ближайшие свободные окна, лист ожидания и прайс.</p>
        </div>
        <div className="client-avatar-large">{client.avatarUrl ? <img src={client.avatarUrl} alt="Фото клиента" /> : client.firstName.slice(0, 1).toUpperCase()}</div>
      </section>

      <ActiveBookingCard token={token} bookings={activeBookings} />

      <section className="client-card" id="windows">
        <div className="client-section-head">
          <div>
            <p className="client-eyebrow">Онлайн-запись</p>
            <h2>Ближайшие свободные окна</h2>
            <p>{defaultService ? `Показаны окна, которые подходят под услугу “${defaultService.title}”. Услугу можно поменять на следующем шаге.` : "Сначала мастер добавит услуги в прайс."}</p>
          </div>
          <span className="client-status ok">{totalVisibleSlots} окон</span>
        </div>

        {freeGroups.length ? (
          <div className="client-window-days">
            {freeGroups.map(([key, slots]) => (
              <article className="client-window-day" key={key}>
                <div>
                  <b>{shortDate(slots[0].startAt)}</b>
                  <small>{formatDateOnly(slots[0].startAt)}</small>
                </div>
                <div className="client-time-pills">
                  {slots.slice(0, 5).map((slot) => <a key={slot.startAt.toISOString()} href={bookingHref(token, defaultServiceId, key, slot)}>{formatTimeOnly(slot.startAt)}</a>)}
                  {slots.length > 5 ? <a className="muted" href={`/booking?client=${token}&service=${defaultServiceId}&date=${key}#time`}>ещё {slots.length - 5}</a> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="client-empty">
            <h3>Свободных окон пока нет</h3>
            <p>Можно встать в лист ожидания — мастер увидит, если освободится подходящее время.</p>
            <a className="client-button" href="#waitlist">Встать в лист ожидания</a>
          </div>
        )}

        {defaultService ? <a className="client-link" href={`/booking?client=${token}&service=${defaultServiceId}`}>Показать весь месяц →</a> : null}
      </section>

      <section className="client-grid-2">
        <section className="client-card" id="price">
          <div className="client-section-head">
            <div>
              <p className="client-eyebrow">Прайс</p>
              <h2>Популярные услуги</h2>
            </div>
            <a className="client-link" href={`/price?client=${token}`}>Весь прайс</a>
          </div>
          <div className="client-service-list">
            {services.slice(0, 5).map((service) => <a key={service.id} href={`/booking?client=${token}&service=${service.id}`}><b>{service.title}</b><span>{service.durationMinutes} мин · {rub(service.price)}</span></a>)}
            {services.length === 0 ? <div className="client-empty small">Прайс пока пуст.</div> : null}
          </div>
        </section>

        <WaitlistBlock token={token} dates={dates} waitlist={client.waitlist} />
      </section>

      {historyBookings.length ? (
        <section className="client-card">
          <div className="client-section-head"><div><p className="client-eyebrow">История</p><h2>Прошлые записи</h2></div></div>
          <div className="client-history-list">
            {historyBookings.slice(0, 6).map((booking) => <article key={booking.id}><span className={statusClass(booking.status)}>{statusText(booking.status)}</span><b>{formatDateTime(booking.startAt)}</b><p>{booking.service.title} · {rub(booking.finalPrice ?? booking.service.price)}</p></article>)}
          </div>
        </section>
      ) : null}
    </main>
  );
}
