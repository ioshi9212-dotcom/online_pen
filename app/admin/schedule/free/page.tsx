import { isAdmin } from "@/lib/admin";
import { formatTimeOnly } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { deleteOnlineWindow } from "../actions";

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined, fallback = "") {
  return Array.isArray(value) ? value[0] || fallback : value || fallback;
}

const weekDays = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function dayTitle(date: Date) {
  return `${date.getDate()} ${weekDays[date.getDay()]}`;
}

function fullDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function FreeWindowsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (!isAdmin()) redirect("/admin/login");

  const done = one(searchParams.done);
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 90);

  const windows = await prisma.onlineWindow.findMany({
    where: { startAt: { gte: now, lt: horizon } },
    orderBy: { startAt: "asc" }
  });

  const grouped = windows.reduce<Record<string, typeof windows>>((acc, item) => {
    const key = fullDateKey(item.startAt);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

  const groups = Object.entries(grouped).map(([key, items]) => ({
    key,
    date: items[0].startAt,
    items,
    text: `${dayTitle(items[0].startAt)} - ${items.map((item) => formatTimeOnly(item.startAt)).join(", ")}`
  }));

  const text = groups.map((group) => group.text).join("\n\n");

  return (
    <section className="grid">
      <div className="card">
        <h1>Список онлайн-окон</h1>
        <p>Это только окна, которые ты вручную открыла для записи клиентов онлайн. Формат можно скопировать или заскринить.</p>
        <div className="actions">
          <a className="button secondary" href="/admin/schedule">Разделы расписания</a>
          <a className="button secondary" href="/admin/schedule?view=calendar">Календарь окон</a>
          <a className="button secondary" href="/admin">Админка</a>
        </div>
      </div>

      {done ? <div className="notice ok-notice" style={{ position: "sticky", top: 12, zIndex: 20 }}>Готово: {done}</div> : null}

      <div className="card">
        <h2>Скопировать список</h2>
        <textarea className="copy-area" readOnly value={text || "Онлайн-окон пока нет."} />
      </div>

      <div className="card">
        <h2>Окна</h2>
        {windows.length === 0 ? <div className="notice">Открытых онлайн-окон пока нет.</div> : null}
        <div className="grid">
          {groups.map((group) => (
            <div key={group.key} style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 4 }}>
              <h3 style={{ marginBottom: 10 }}>{group.text}</h3>
              <div className="actions">
                {group.items.map((item) => (
                  <form action={deleteOnlineWindow} key={item.id} className="slot" style={{ minWidth: 120 }}>
                    <b>{formatTimeOnly(item.startAt)}</b>
                    <input type="hidden" name="id" value={item.id} />
                    <button className="danger">Убрать</button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
