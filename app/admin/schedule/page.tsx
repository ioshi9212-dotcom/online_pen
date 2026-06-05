import { addBlockedSlot, deleteBlockedSlot, saveScheduleRule } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

const days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export default async function SchedulePage() {
  if (!isAdmin()) redirect("/admin/login");
  const rules = await prisma.scheduleRule.findMany({ orderBy: { weekday: "asc" } });
  const blocked = await prisma.blockedSlot.findMany({ orderBy: { startAt: "asc" }, take: 50 });

  return (
    <section className="grid">
      <div className="card">
        <h1>Расписание</h1>
        <p>Здесь редактируются рабочие дни. Клиент увидит только свободные окна.</p>
        <div className="grid">
          {days.map((day, weekday) => {
            const rule = rules.find((item) => item.weekday === weekday);
            return (
              <form action={saveScheduleRule} className="card grid" key={weekday}>
                <input type="hidden" name="weekday" value={weekday} />
                <h3>{day}</h3>
                <label><input type="checkbox" name="isWorkingDay" defaultChecked={rule?.isWorkingDay ?? false} /> Рабочий день</label>
                <div className="grid-2">
                  <label>Начало<input name="startTime" type="time" defaultValue={rule?.startTime || "09:00"} /></label>
                  <label>Конец<input name="endTime" type="time" defaultValue={rule?.endTime || "20:00"} /></label>
                </div>
                <button className="secondary">Сохранить</button>
              </form>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>Закрыть отдельное окно</h2>
        <form action={addBlockedSlot} className="grid">
          <div className="grid-2">
            <label>Начало<input name="startAt" type="datetime-local" required /></label>
            <label>Конец<input name="endAt" type="datetime-local" required /></label>
          </div>
          <label>Причина<input name="reason" placeholder="Личные дела / выходной / занято" /></label>
          <button>Закрыть окно</button>
        </form>

        <h2 style={{ marginTop: 24 }}>Закрытые окна</h2>
        <table className="table">
          <tbody>
            {blocked.map((slot) => (
              <tr key={slot.id}>
                <td>{formatDateTime(slot.startAt)} — {formatDateTime(slot.endAt)}</td>
                <td>{slot.reason}</td>
                <td><form action={deleteBlockedSlot}><input type="hidden" name="id" value={slot.id} /><button className="danger">Открыть</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
