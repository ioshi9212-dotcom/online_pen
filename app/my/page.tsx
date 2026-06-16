import { cancelClientBooking, joinWaitlist } from "@/app/actions";
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
function statusText(status: string) {
  return status === "PENDING" ? "Ожидает подтверждения" : status === "CONFIRMED" ? "Подтверждена" : status;
}
function statusClass(status: string) {
  return status === "PENDING" ? "status wait" : status === "CONFIRMED" ? "status ok" : "status";
}
function dateOptions(days = 45) {
  const arr: { value: string; label: string }[] = [];
  const start = new Date(); start.setHours(0,0,0,0);
  for (let i=0;i<days;i++) { const d = new Date(start); d.setDate(start.getDate()+i); arr.push({ value: d.toISOString().slice(0,10), label: new Intl.DateTimeFormat("ru-RU", { day:"2-digit", month:"2-digit", weekday:"short" }).format(d) }); }
  return arr;
}

export default async function MyPage({ searchParams }: { searchParams: { client?: string; created?: string; waitlist?: string; cancelled?: string } }) {
  const token = searchParams.client;
  if (!token) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { publicToken: token },
    include: {
      bookings: { include: { service: true }, orderBy: { startAt: "asc" } },
      waitlist: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } }
    }
  });
  if (!client) redirect("/login");
  if (client.status !== "APPROVED") redirect("/unavailable");

  const [services, onlineWindows, busyBookings] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }], take: 5 }),
    prisma.onlineWindow.findMany({ where: { startAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 30 }),
    prisma.booking.findMany({ where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gte: new Date() } }, select: { startAt: true } })
  ]);
  const busy = new Set(busyBookings.map((b) => b.startAt.toISOString()));
  const free = onlineWindows.filter((w) => !busy.has(w.startAt.toISOString())).slice(0, 12);
  const grouped = free.reduce((map, item) => { const k = item.startAt.toISOString().slice(0,10); map.set(k, [...(map.get(k)||[]), item]); return map; }, new Map<string, typeof free>());
  const activeBookings = client.bookings.filter((b) => ["PENDING", "CONFIRMED"].includes(b.status));
  const mainBooking = activeBookings[0];
  const firstService = services[0];

  return (
    <main className="client-page">
      <section className="hero">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div><h1>Привет, {client.firstName}</h1><p>Ваша запись, свободные окна и лист ожидания.</p></div>
          <div className="actions"><a className="button secondary" href={`/profile?client=${token}`}>Профиль</a><a className="button" href={`/booking?client=${token}`}>Записаться</a></div>
        </div>
      </section>

      {searchParams.created ? <div className="notice ok-status">Заявка отправлена. Окно уже закреплено за вами.</div> : null}
      {searchParams.waitlist ? <div className="notice ok-status">Вы в листе ожидания.</div> : null}
      {searchParams.cancelled ? <div className="notice">Запись отменена.</div> : null}

      <section className="card">
        <h2>Ваша запись</h2>
        {mainBooking ? (
          <div className="grid">
            <p><b>{fmtDate(mainBooking.startAt)}, {fmtTime(mainBooking.startAt)}</b></p>
            <p>{mainBooking.service.title} · {rub(mainBooking.finalPrice ?? mainBooking.service.price)}</p>
            <span className={statusClass(mainBooking.status)}>{statusText(mainBooking.status)}</span>
            {mainBooking.status === "PENDING" ? <p>Окно уже закреплено за вами. Осталось дождаться подтверждения мастера.</p> : null}
            <details><summary className="button secondary">Отменить</summary><form action={cancelClientBooking} className="grid" style={{ marginTop: 12 }}><input type="hidden" name="clientToken" value={token} /><input type="hidden" name="bookingId" value={mainBooking.id} /><button className="danger">Да, отменить</button></form></details>
          </div>
        ) : <div className="empty-state"><p>Активной записи нет.</p><a className="button" href="#windows">Выбрать окно</a></div>}
      </section>

      <section className="card" id="windows">
        <h2>Ближайшие свободные окна</h2>
        {firstService ? <p>Показаны открытые окна. Услугу можно поменять на следующем шаге.</p> : <p>Прайс пока пуст.</p>}
        <div className="window-list">
          {Array.from(grouped.entries()).map(([key, items]) => (
            <div className="window-row" key={key}>
              <div><b>{fmtDate(items[0].startAt)}</b><p>{items.length} свободно</p></div>
              <div className="time-pills">{items.map((w) => <a key={w.id} href={`/booking?client=${token}&service=${firstService?.id || ""}&time=${encodeURIComponent(w.startAt.toISOString())}`}>{fmtTime(w.startAt)}</a>)}</div>
            </div>
          ))}
          {free.length === 0 ? <div className="empty-state"><p>Свободных окон пока нет.</p><a className="button secondary" href="#waitlist">Встать в лист ожидания</a></div> : null}
        </div>
      </section>

      <section className="top-split">
        <article className="card" id="price"><h2>Прайс</h2><div className="grid">{services.map((s) => <a className="service-card" key={s.id} href={`/booking?client=${token}&service=${s.id}`}><b>{s.title}</b><p>{s.durationMinutes} мин · {rub(s.price)}</p></a>)}</div></article>
        <article className="card" id="waitlist"><h2>Лист ожидания</h2><p>Если подходящего времени нет — оставьте пожелания.</p><form action={joinWaitlist} className="grid"><input type="hidden" name="clientToken" value={token} /><select name="waitMode" defaultValue="NEAREST"><option value="NEAREST">Ближайшее окно</option><option value="DATES">Конкретные даты</option></select><div className="time-pills">{dateOptions(14).map((d) => <label key={d.value} style={{ width: "auto" }}><input type="checkbox" name="desiredDates" value={d.value} /> {d.label}</label>)}</div><textarea name="note" placeholder="Комментарий" /><button>Отправить</button></form></article>
      </section>
    </main>
  );
}
