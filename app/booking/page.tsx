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

function groupSlotsByDate(slots: { startAt: Date; endAt: Date }[]) {
  const map = new Map<string, { startAt: Date; endAt: Date }[]>();
  for (const slot of slots) {
    const key = dateKey(slot.startAt);
    const list = map.get(key) || [];
    list.push(slot);
    map.set(key, list);
  }
  return map;
}

const calendarGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: "10px"
};

const dayButtonBaseStyle = {
  minHeight: "118px",
  borderRadius: "24px",
  border: "1px solid var(--line)",
  padding: "12px",
  display: "grid",
  gap: "7px",
  alignContent: "start",
  background: "rgba(255,255,255,.82)",
  color: "inherit"
};

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
    <section className="grid">
      <div className="card">
        <h1>Онлайн-запись</h1>
        <p>Привет, {client.firstName}. Выберите услугу, дату и свободное время. Заявка уйдёт мастеру на подтверждение.</p>
        {searchParams.busy ? <div className="notice">Это время уже заняли. Выберите другое окно.</div> : null}
      </div>

      <div className="card">
        <h2>1. Выберите услугу</h2>
        {services.length ? (
          <div className="actions">
            {services.map((service) => {
              const active = selectedService?.id === service.id;
              return (
                <a
                  className={active ? "button" : "button secondary"}
                  href={`/booking?client=${token}&service=${service.id}&month=${month.key}`}
                  key={service.id}
                >
                  {service.title} · {rub(service.price)}
                </a>
              );
            })}
            <a className="button secondary" href={`/my?client=${token}`}>Мои записи</a>
          </div>
        ) : (
          <div className="notice">Пока нет активных услуг для записи.</div>
        )}
      </div>

      {selectedService ? (
        <div className="card">
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <div>
              <h2>2. Выберите дату</h2>
              <p>{selectedService.title} · {selectedService.durationMinutes} мин · {rub(selectedService.price)}</p>
            </div>
            <div className="actions">
              <a className="button secondary" href={`/booking?client=${token}&service=${selectedService.id}&month=${month.prevKey}`}>←</a>
              <span className="pill">{month.title}</span>
              <a className="button secondary" href={`/booking?client=${token}&service=${selectedService.id}&month=${month.nextKey}`}>→</a>
            </div>
          </div>

          <div style={{ ...calendarGridStyle, marginTop: 18, textAlign: "center", color: "var(--muted)", fontWeight: 800 }}>
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <div key={day}>{day}</div>)}
          </div>

          <div style={{ ...calendarGridStyle, marginTop: 10 }}>
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
                  style={{
                    ...dayButtonBaseStyle,
                    opacity: hasSlots ? 1 : .62,
                    outline: selected ? "4px solid rgba(216, 137, 166, .24)" : "none",
                    borderColor: selected ? "#d889a6" : "var(--line)",
                    background: hasSlots ? "linear-gradient(135deg, rgba(255,255,255,.92), rgba(252,232,240,.92))" : "rgba(255,255,255,.56)"
                  }}
                >
                  <strong style={{ fontSize: 20 }}>{dayNumber} {shortDay(day)}</strong>
                  {hasSlots ? (
                    <>
                      <span className="small">Есть окна</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {daySlots.slice(0, 4).map((slot) => (
                          <span className="status" key={slot.startAt.toISOString()}>{formatTimeOnly(slot.startAt)}</span>
                        ))}
                        {daySlots.length > 4 ? <span className="small">+{daySlots.length - 4}</span> : null}
                      </div>
                    </>
                  ) : (
                    <span className="small">Мест нет</span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      ) : null}

      {selectedService && selectedDateKey ? (
        <div className="card" id="time">
          <h2>3. Выберите время</h2>
          <p>{formatDateOnly(new Date(`${selectedDateKey}T00:00:00.000Z`))} · {selectedService.title}</p>
          {selectedSlots.length ? (
            <div className="actions">
              {selectedSlots.map((slot) => (
                <form action={createBooking} key={slot.startAt.toISOString()}>
                  <input type="hidden" name="clientToken" value={token} />
                  <input type="hidden" name="serviceId" value={selectedService.id} />
                  <input type="hidden" name="startAt" value={slot.startAt.toISOString()} />
                  <button type="submit">
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
  );
}
