import { isAdmin } from "@/lib/admin";
import { formatDateOnly, formatTimeOnly } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { generateSlots, getSettingInt } from "@/lib/schedule";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined, fallback = "") {
  return Array.isArray(value) ? value[0] || fallback : value || fallback;
}

function intParam(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function FreeWindowsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (!isAdmin()) redirect("/admin/login");

  const durationMinutes = intParam(one(searchParams.duration, "150"), 150);
  const daysAhead = intParam(one(searchParams.days, "30"), 30);

  const [rules, settings, bookings, blockedSlots, dayOverrides] = await Promise.all([
    prisma.scheduleRule.findMany(),
    prisma.setting.findMany(),
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] as any } } }),
    prisma.blockedSlot.findMany(),
    prisma.dayOverride.findMany()
  ]);

  const stepMinutes = getSettingInt(settings, "SLOT_STEP_MINUTES", 30);
  const slots = generateSlots({
    service: { durationMinutes },
    rules,
    bookings,
    blockedSlots,
    daysAhead,
    stepMinutes,
    dayOverrides
  });

  const grouped = slots.reduce<Record<string, typeof slots>>((acc, slot) => {
    const key = slot.startAt.toISOString().slice(0, 10);
    acc[key] ||= [];
    acc[key].push(slot);
    return acc;
  }, {});

  const copyText = Object.values(grouped).map((items) => {
    const day = formatDateOnly(items[0].startAt);
    const times = items.map((slot) => formatTimeOnly(slot.startAt)).join(", ");
    return `${day}: ${times}`;
  }).join("\n");

  return (
    <div className="grid">
      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h1>Свободные окна</h1>
            <p>Список можно выделить, скопировать или просто сделать скрин.</p>
          </div>
          <a className="button secondary" href="/admin/schedule">Назад к расписанию</a>
        </div>
        <form className="grid-3" action="/admin/schedule/free">
          <label>Длительность услуги
            <select name="duration" defaultValue={String(durationMinutes)}>
              <option value="60">1 час</option>
              <option value="90">1,5 часа</option>
              <option value="120">2 часа</option>
              <option value="150">2,5 часа</option>
              <option value="180">3 часа</option>
              <option value="210">3,5 часа</option>
              <option value="240">4 часа</option>
            </select>
          </label>
          <label>Период
            <select name="days" defaultValue={String(daysAhead)}>
              <option value="14">14 дней</option>
              <option value="30">30 дней</option>
              <option value="60">60 дней</option>
              <option value="90">90 дней</option>
            </select>
          </label>
          <label>&nbsp;<button>Показать окна</button></label>
        </form>
      </section>

      <section className="card">
        <h2>Текст для копирования</h2>
        {copyText ? <textarea className="copy-area" readOnly value={copyText} /> : <div className="notice">Свободных окон по выбранным условиям пока нет.</div>}
      </section>

      <section className="card">
        <h2>Список для скрина</h2>
        <div className="free-window-list">
          {Object.entries(grouped).map(([key, items]) => (
            <div className="mini-card" key={key}>
              <h3>{formatDateOnly(items[0].startAt)}</h3>
              <div className="time-list">
                {items.map((slot) => <span className="time-pill free" key={slot.startAt.toISOString()}>{formatTimeOnly(slot.startAt)}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
