import { createBooking } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(date);
}
function fmtTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}
function dayKey(date: Date) {
  return date.toISOString().slice(0,10);
}

export default async function BookingPage({ searchParams }: { searchParams: { client?: string; service?: string; time?: string; busy?: string } }) {
  const token = searchParams.client;
  if (!token) redirect("/login");

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client || client.status !== "APPROVED") redirect("/unavailable");

  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const selectedService = services.find((s) => s.id === searchParams.service) || services[0];

  const [onlineWindows, busyBookings] = await Promise.all([
    prisma.onlineWindow.findMany({ where: { startAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 50 }),
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gte: new Date() } }, select: { startAt: true } })
  ]);
  const busy = new Set(busyBookings.map((b) => b.startAt.toISOString()));
  const free = onlineWindows.filter((w) => !busy.has(w.startAt.toISOString()));
  const grouped = free.reduce((map, item) => { const k = dayKey(item.startAt); map.set(k, [...(map.get(k)||[]), item]); return map; }, new Map<string, typeof free>());
  const selectedSlot = searchParams.time ? free.find((w) => w.startAt.toISOString() === searchParams.time) : undefined;

  return (
    <main className="booking-page">
      <section className="hero">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div><h1>Запись онлайн</h1><p>{client.firstName}, выберите услугу и свободное время.</p></div>
          <a className="button secondary" href={`/my?client=${token}`}>В кабинет</a>
        </div>
      </section>

      {searchParams.busy ? <div className="notice danger-status">Это окно уже заняли. Выберите другое.</div> : null}

      <section className="step-block">
        <h2>1. Услуга</h2>
        <div className="service-grid">
          {services.map((service) => <a key={service.id} className={selectedService?.id === service.id ? "service-option active" : "service-option"} href={`/booking?client=${token}&service=${service.id}`}><b>{service.title}</b><small>{service.durationMinutes} мин · {rub(service.price)}</small></a>)}
        </div>
      </section>

      <section className="step-block">
        <h2>2. Дата и время</h2>
        <div className="window-list">
          {Array.from(grouped.entries()).slice(0, 14).map(([key, items]) => (
            <div className="window-row" key={key}>
              <div><b>{fmtDate(items[0].startAt)}</b><p>{items.length} свободно</p></div>
              <div className="time-pills">{items.map((w) => <a key={w.id} href={`/booking?client=${token}&service=${selectedService?.id || ""}&time=${encodeURIComponent(w.startAt.toISOString())}#confirm`}>{fmtTime(w.startAt)}</a>)}</div>
            </div>
          ))}
          {free.length === 0 ? <div className="empty-state">Свободных окон нет. Можно встать в лист ожидания в кабинете.</div> : null}
        </div>
      </section>

      {selectedService && selectedSlot ? (
        <section className="step-block" id="confirm">
          <h2>3. Подтверждение</h2>
          <div className="grid-3">
            <div className="card"><small>Услуга</small><b>{selectedService.title}</b></div>
            <div className="card"><small>Дата</small><b>{fmtDate(selectedSlot.startAt)}</b></div>
            <div className="card"><small>Время</small><b>{fmtTime(selectedSlot.startAt)}</b></div>
          </div>
          <form action={createBooking} className="grid" style={{ marginTop: 16 }}>
            <input type="hidden" name="clientToken" value={token} />
            <input type="hidden" name="serviceId" value={selectedService.id} />
            <input type="hidden" name="startAt" value={selectedSlot.startAt.toISOString()} />
            <label>Комментарий<textarea name="comment" placeholder="Например: ремонт, дизайн, пожелания" /></label>
            <button type="submit">Отправить заявку</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
