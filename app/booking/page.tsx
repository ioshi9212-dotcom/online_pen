import { createBooking } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, formatTimeOnly, rub } from "@/lib/format";
import { generateSlots, getSettingInt } from "@/lib/schedule";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  client?: string;
  service?: string;
  busy?: string;
  date?: string;
  time?: string;
};

type Slot = { startAt: Date; endAt: Date };

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function groupSlotsByDate(slots: Slot[]) {
  const map = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = dateKey(slot.startAt);
    const list = map.get(key) || [];
    list.push(slot);
    map.set(key, list);
  }
  return map;
}

function shortDate(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Завтра";

  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long" })
    .format(date)
    .replace(".", "");
}

function makeBookingHref(token: string, serviceId: string, date: string, startAt: Date) {
  return `/booking?client=${token}&service=${serviceId}&date=${date}&time=${encodeURIComponent(startAt.toISOString())}#confirm`;
}

export default async function BookingPage({ searchParams }: { searchParams: SearchParams }) {
  const token = searchParams.client;
  if (!token) redirect("/login");

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client || client.status !== "APPROVED") redirect("/unavailable");

  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
  });

  const selectedService = searchParams.service
    ? services.find((service) => service.id === searchParams.service) || services[0]
    : services[0];

  const [rules, settings] = await Promise.all([
    prisma.scheduleRule.findMany(),
    prisma.setting.findMany()
  ]);

  const daysAhead = getSettingInt(settings, "booking_days_ahead", 60);
  const stepMinutes = getSettingInt(settings, "slot_step_minutes", getSettingInt(settings, "SLOT_STEP_MINUTES", 30));

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + daysAhead + 1);

  const [bookings, blockedSlots, dayOverrides, onlineWindows] = await Promise.all([
    prisma.booking.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { lt: horizon } },
      select: { startAt: true, endAt: true }
    }),
    prisma.blockedSlot.findMany({
      where: { startAt: { lt: horizon } },
      select: { startAt: true, endAt: true }
    }),
    prisma.dayOverride.findMany(),
    prisma.onlineWindow.findMany({
      where: { startAt: { gte: new Date(), lt: horizon } },
      select: { startAt: true },
      orderBy: { startAt: "asc" }
    })
  ]);

  const onlineWindowSet = new Set(onlineWindows.map((window) => window.startAt.toISOString()));

  const allSlots = selectedService
    ? generateSlots({ service: selectedService, rules, bookings, blockedSlots, daysAhead, stepMinutes, dayOverrides })
    : [];

  const slots = allSlots.filter((slot) => onlineWindowSet.has(slot.startAt.toISOString()));
  const slotsByDate = groupSlotsByDate(slots);
  const dateGroups = Array.from(slotsByDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  const selectedDateKey = searchParams.date && slotsByDate.has(searchParams.date)
    ? searchParams.date
    : dateGroups[0]?.[0] || "";
  const selectedSlots = selectedDateKey ? slotsByDate.get(selectedDateKey) || [] : [];
  const selectedSlot = searchParams.time
    ? slots.find((slot) => slot.startAt.toISOString() === searchParams.time)
    : null;

  return (
    <main className="booking-page">
      <section className="booking-panel">
        <div className="booking-title-row">
          <div>
            <p className="eyebrow">Запись онлайн</p>
            <h1>Выберите окно</h1>
            <p className="lead">
              Привет, {client.firstName}. Тут только открытые онлайн-окна. Если времени нет — сайт не вредничает, мест правда нет.
            </p>
          </div>
          <a className="quiet-link" href={`/my?client=${token}`}>Мои записи</a>
        </div>

        {searchParams.busy ? <div className="notice danger-notice">Это окно уже уехало. Выберите другое.</div> : null}

        <div className="step-block">
          <div className="step-head">
            <span className="step-number">1</span>
            <h2>Услуга</h2>
          </div>

          {services.length ? (
            <div className="service-list">
              {services.map((service) => {
                const active = selectedService?.id === service.id;
                return (
                  <a
                    className={active ? "service-chip active" : "service-chip"}
                    href={`/booking?client=${token}&service=${service.id}`}
                    key={service.id}
                  >
                    <strong>{service.title}</strong>
                    <span>{service.durationMinutes} мин · {rub(service.price)}</span>
                    {service.description ? <small>{service.description}</small> : null}
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="notice">Активных услуг пока нет. Прайс решил поспать.</div>
          )}
        </div>

        {selectedService ? (
          <div className="step-block">
            <div className="step-head">
              <span className="step-number">2</span>
              <div>
                <h2>Ближайшие окна</h2>
                <p>{selectedService.title} · {selectedService.durationMinutes} мин</p>
              </div>
            </div>

            {dateGroups.length ? (
              <div className="date-card-list">
                {dateGroups.slice(0, 14).map(([key, daySlots]) => {
                  const active = key === selectedDateKey;
                  const day = daySlots[0].startAt;
                  return (
                    <a
                      className={active ? "date-option active" : "date-option"}
                      href={`/booking?client=${token}&service=${selectedService.id}&date=${key}#time`}
                      key={key}
                    >
                      <span>{shortDate(day)}</span>
                      <b>{formatDateOnly(day)}</b>
                      <small>{daySlots.length} {daySlots.length === 1 ? "окно" : "окна"}</small>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <h3>Свободных окон сейчас нет</h3>
                <p>Система не драматизирует. Она просто честная.</p>
                <a className="button secondary" href={`/my?client=${token}#waitlist`}>Встать в лист ожидания</a>
              </div>
            )}
          </div>
        ) : null}

        {selectedService && selectedDateKey && selectedSlots.length ? (
          <div className="step-block" id="time">
            <div className="step-head">
              <span className="step-number">3</span>
              <div>
                <h2>Время</h2>
                <p>{formatDateOnly(selectedSlots[0].startAt)}</p>
              </div>
            </div>

            <div className="time-grid">
              {selectedSlots.map((slot) => {
                const active = selectedSlot?.startAt.toISOString() === slot.startAt.toISOString();
                return (
                  <a
                    className={active ? "time-button active" : "time-button"}
                    href={makeBookingHref(token, selectedService.id, selectedDateKey, slot.startAt)}
                    key={slot.startAt.toISOString()}
                  >
                    {formatTimeOnly(slot.startAt)}–{formatTimeOnly(slot.endAt)}
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}

        {selectedService && selectedSlot ? (
          <div className="step-block confirm-panel" id="confirm">
            <div className="step-head">
              <span className="step-number">4</span>
              <div>
                <h2>Проверить и отправить</h2>
                <p>Последний шанс заметить, что пальцы записались не туда.</p>
              </div>
            </div>

            <div className="summary-card">
              <div><span>Услуга</span><b>{selectedService.title}</b></div>
              <div><span>Дата</span><b>{formatDateOnly(selectedSlot.startAt)}</b></div>
              <div><span>Время</span><b>{formatTimeOnly(selectedSlot.startAt)}–{formatTimeOnly(selectedSlot.endAt)}</b></div>
              <div><span>Цена</span><b>{rub(selectedService.price)}</b></div>
            </div>

            <form action={createBooking} className="grid">
              <input type="hidden" name="clientToken" value={token} />
              <input type="hidden" name="serviceId" value={selectedService.id} />
              <input type="hidden" name="startAt" value={selectedSlot.startAt.toISOString()} />
              <label>Комментарий, если надо
                <textarea name="comment" placeholder="Например: нужен ремонт / хочу нюд / есть идея / идеи нет, держимся" />
              </label>
              <div className="actions">
                <button type="submit">Отправить заявку</button>
                <a className="button secondary" href={`/booking?client=${token}&service=${selectedService.id}&date=${selectedDateKey}#time`}>Выбрать другое время</a>
              </div>
            </form>
          </div>
        ) : null}
      </section>
    </main>
  );
}
