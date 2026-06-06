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
  month?: string;
};

type Slot = { startAt: Date; endAt: Date };

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(value: string | undefined) {
  const now = new Date();
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function monthInfo(value: string | undefined) {
  const first = parseMonth(value);
  const year = first.getFullYear();
  const monthIndex = first.getMonth();
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const firstOffset = (first.getDay() + 6) % 7;
  const prev = new Date(year, monthIndex - 1, 1);
  const next = new Date(year, monthIndex + 1, 1);

  return {
    year,
    monthIndex,
    lastDay,
    firstOffset,
    key: monthKey(first),
    title: new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(first),
    prevKey: monthKey(prev),
    nextKey: monthKey(next)
  };
}

function shortDay(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", "");
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

  const month = monthInfo(searchParams.month);
  const selectedDateKey = searchParams.date || "";

  const [rules, settings] = await Promise.all([
    prisma.scheduleRule.findMany(),
    prisma.setting.findMany()
  ]);

  const daysAhead = getSettingInt(settings, "booking_days_ahead", 60);
  const stepMinutes = getSettingInt(settings, "slot_step_minutes", getSettingInt(settings, "SLOT_STEP_MINUTES", 30));

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + daysAhead + 1);

  const [bookings, blockedSlots, dayOverrides] = await Promise.all([
    prisma.booking.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { lt: horizon } },
      select: { startAt: true, endAt: true }
    }),
    prisma.blockedSlot.findMany({
      where: { startAt: { lt: horizon } },
      select: { startAt: true, endAt: true }
    }),
    prisma.dayOverride.findMany()
  ]);

  const slots = selectedService
    ? generateSlots({ service: selectedService, rules, bookings, blockedSlots, daysAhead, stepMinutes, dayOverrides })
    : [];

  const slotsByDate = groupSlotsByDate(slots);
  const selectedSlots = selectedDateKey ? slotsByDate.get(selectedDateKey) || [] : [];

  return (
    <main className="booking-page">
      <section className="booking-panel">
        <div className="booking-title-row">
          <div>
            <p className="eyebrow">Запись онлайн</p>
            <h1>Выберите удобное время</h1>
            <p className="lead">Привет, {client.firstName}. Сначала услуга, потом дата, потом свободное время.</p>
          </div>
          <a className="quiet-link" href={`/my?client=${token}`}>Мои записи</a>
        </div>

        {searchParams.busy ? <div className="notice">Это время уже заняли. Выберите другое окно.</div> : null}

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
                    href={`/booking?client=${token}&service=${service.id}&month=${month.key}`}
                    key={service.id}
                  >
                    <strong>{service.title}</strong>
                    <span>{service.durationMinutes} мин · {rub(service.price)}</span>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="notice">Пока нет активных услуг для записи.</div>
          )}
        </div>

        {selectedService ? (
          <div className="step-block">
            <div className="booking-calendar-head">
              <div className="step-head compact">
                <span className="step-number">2</span>
                <div>
                  <h2>Дата</h2>
                  <p>{selectedService.title} · {selectedService.durationMinutes} мин</p>
                </div>
              </div>
              <div className="month-switcher">
                <a href={`/booking?client=${token}&service=${selectedService.id}&month=${month.prevKey}`}>←</a>
                <span>{month.title}</span>
                <a href={`/booking?client=${token}&service=${selectedService.id}&month=${month.nextKey}`}>→</a>
              </div>
            </div>

            <div className="calendar-weekdays">
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <div key={day}>{day}</div>)}
            </div>

            <div className="booking-calendar">
              {Array.from({ length: month.firstOffset }).map((_, index) => <div key={`empty-${index}`} />)}
              {Array.from({ length: month.lastDay }).map((_, index) => {
                const dayNumber = index + 1;
                const day = new Date(month.year, month.monthIndex, dayNumber);
                const key = dateKey(day);
                const daySlots = slotsByDate.get(key) || [];
                const hasSlots = daySlots.length > 0;
                const selected = selectedDateKey === key;

                const href = hasSlots
                  ? `/booking?client=${token}&service=${selectedService.id}&month=${month.key}&date=${key}#time`
                  : `/booking?client=${token}&service=${selectedService.id}&month=${month.key}`;

                return (
                  <a
                    key={key}
                    href={href}
                    className={[
                      "calendar-day",
                      hasSlots ? "has-slots" : "no-slots",
                      selected ? "selected" : ""
                    ].join(" ")}
                  >
                    <strong>{dayNumber} {shortDay(day)}</strong>
                    {hasSlots ? (
                      <span className="day-times">
                        {daySlots.slice(0, 3).map((slot) => (
                          <b key={slot.startAt.toISOString()}>{formatTimeOnly(slot.startAt)}</b>
                        ))}
                        {daySlots.length > 3 ? <em>+{daySlots.length - 3}</em> : null}
                      </span>
                    ) : (
                      <span className="no-place">мест нет</span>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}

        {selectedService && selectedDateKey ? (
          <div className="step-block" id="time">
            <div className="step-head">
              <span className="step-number">3</span>
              <div>
                <h2>Время</h2>
                <p>{formatDateOnly(new Date(`${selectedDateKey}T00:00:00.000Z`))}</p>
              </div>
            </div>

            {selectedSlots.length ? (
              <div className="time-grid">
                {selectedSlots.map((slot) => (
                  <form action={createBooking} key={slot.startAt.toISOString()}>
                    <input type="hidden" name="clientToken" value={token} />
                    <input type="hidden" name="serviceId" value={selectedService.id} />
                    <input type="hidden" name="startAt" value={slot.startAt.toISOString()} />
                    <button type="submit" className="time-button">
                      {formatTimeOnly(slot.startAt)}–{formatTimeOnly(slot.endAt)}
                    </button>
                  </form>
                ))}
              </div>
            ) : (
              <div className="notice">На эту дату свободных мест уже нет. Выберите другую дату.</div>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
