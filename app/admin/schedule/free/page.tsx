import { isAdmin } from "@/lib/admin";
import { formatDateOnly, formatTimeOnly } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { deleteOnlineWindow } from "../actions";

export const dynamic = "force-dynamic";

export default async function FreeWindowsPage() {
  if (!isAdmin()) redirect("/admin/login");

  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 90);

  const windows = await prisma.onlineWindow.findMany({
    where: { startAt: { gte: now, lt: horizon } },
    orderBy: { startAt: "asc" }
  });

  const text = windows.map((item) => `${formatDateOnly(item.startAt)} ${formatTimeOnly(item.startAt)}`).join("\n");

  return (
    <section className="grid">
      <div className="card">
        <h1>Список онлайн-окон</h1>
        <p>Это окна, которые ты вручную открыла для записи клиентов онлайн. Можно скопировать текст или сделать скрин.</p>
        <div className="actions">
          <a className="button secondary" href="/admin/schedule">Назад к календарю</a>
          <a className="button secondary" href="/admin">Админка</a>
        </div>
      </div>

      <div className="card">
        <h2>Скопировать список</h2>
        <textarea className="copy-area" readOnly value={text || "Онлайн-окон пока нет."} />
      </div>

      <div className="card">
        <h2>Окна</h2>
        {windows.length === 0 ? <div className="notice">Открытых онлайн-окон пока нет.</div> : null}
        <div className="grid">
          {windows.map((item) => (
            <div className="slot" key={item.id}>
              <strong>{formatDateOnly(item.startAt)}</strong>
              <span>{formatTimeOnly(item.startAt)}</span>
              <form action={deleteOnlineWindow}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="month" value={`${item.startAt.getFullYear()}-${String(item.startAt.getMonth() + 1).padStart(2, "0")}`} />
                <input type="hidden" name="date" value={item.startAt.toISOString().slice(0, 10)} />
                <button className="danger">Убрать окно</button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
