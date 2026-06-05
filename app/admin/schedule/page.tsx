import { isAdmin } from "@/lib/admin";
import { formatDateOnly, formatDateTime, formatTimeOnly, rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { dateFromKey, dateKey, generateTimeList, getEffectiveDay, getSettingInt, getSlotState } from "@/lib/schedule";
import { redirect } from "next/navigation";
import { createScheduleBooking, deleteDayOverride, saveDayOverride, saveScheduleMode } from "./actions";

export const dynamic = "force-dynamic";

const daysShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
function one(value: string | string[] | undefined, fallback = "") {
  return Array.isArray(value) ? value[0] || fallback : value || fallback;
}

function monthInfo(monthParam: string) {
  const now = new Date();
  const [y, m] = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const year = y;
  const monthIndex = m - 1;
  const first = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const prev = new Date(year, monthIndex - 1, 1);
  const next = new Date(year, monthIndex + 1, 1);
  const firstOffset = (first.getDay() + 6) % 7;
  return {
    year,
    monthIndex,
    key,
    firstOffset,
    lastDay,
    title: new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(first),
    prevKey: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`,
    nextKey: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`
  };
}

function dayStatusLabel(kind: string, isWorkingDay: boolean) {
  if (kind === "SPECIAL") return "особенный";
  if (kind === "WORKING") return "рабочий";
  if (kind === "DAY_OFF") return "выходной";
  return isWorkingDay ? "рабочий" : "выходной";
}

export default async function SchedulePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (!isAdmin()) redirect("/admin/login");

  const month = monthInfo(one(searchParams.month));
  const selectedDateKey = one(searchParams.date);
  const selectedDay = selectedDateKey ? dateFromKey(selectedDateKey) : null;
  const warning = one(searchParams.warning);
  const success = one(searchParams.success);

  const monthStart = new Date(month.year, month.monthIndex, 1);
  const monthEnd = new Date(month.year, month.monthIndex + 1, 1);

  const [rules, settings, overrides, monthBookings, monthBlocks, clients, services] = await Promise.all([
    prisma.scheduleRule.findMany({ orderBy: { weekday: "asc" } }),
    prisma.setting.findMany(),
    prisma.dayOverride.findMany({ where: { date: { gte: monthStart, lt: monthEnd } }, orderBy: { date: "asc" } }),
    prisma.booking.findMany({
      where: { startAt: { gte: monthStart, lt: monthEnd }, status: { in: ["PENDING", "CONFIRMED"] as any } },
      include: { client: true, service: true },
      orderBy: { startAt: "asc" }
    }),
    prisma.blockedSlot.findMany({ where: { startAt: { lt: monthEnd }, endAt: { gt: monthStart } }, orderBy: { startAt: "asc" } }),
    prisma.client.findMany({ where: { status: "APPROVED" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })
  ]);

  const stepMinutes = getSettingInt(settings, "SLOT_STEP_MINUTES", 30);
  const defaultRule = rules.find((item) => item.isWorkingDay) || rules[0];
  const defaultStartTime = defaultRule?.startTime || "09:00";
  const defaultEndTime = defaultRule?.endTime || "20:00";
  const selectedEffective = selectedDay ? getEffectiveDay(selectedDay, rules, overrides) : null;
  const selectedOverride = selectedDay ? overrides.find((item) => dateKey(item.date) === dateKey(selectedDay)) : null;
  const selectedTimes = selectedEffective ? generateTimeList(selectedEffective.startTime, selectedEffective.endTime, stepMinutes) : [];
  const selectedBookings = selectedDay ? monthBookings.filter((item) => dateKey(item.startAt) === dateKey(selectedDay)) : [];
  const selectedBlocks = selectedDay ? monthBlocks.filter((item) => dateKey(item.startAt) === dateKey(selectedDay) || dateKey(item.endAt) === dateKey(selectedDay)) : [];

  return (
    <div className="grid">
      <section className="card">
        <h1>Расписание</h1>
        <p>Теперь расписание управляется через режим работы, календарь дней и ручное создание записей. Дни помечаются цветом, а система предупреждает о выходных и наложениях.</p>
        <div className="actions">
          <a className="button" href="/admin/schedule/free">Свободные окна</a>
          <a className="button secondary" href="#mode">Редактор режима</a>
          <a className="button secondary" href="#calendar">Добавить окна</a>
          <a className="button secondary" href="/admin">Админка</a>
        </div>
      </section>

      <section className="card" id="mode">
        <h2>Редактор режима</h2>
        <p>Здесь задаётся общий шаг времени и обычный рабочий день. Этот режим применяется ко всем дням, а отдельные выходные или особенные дни отмечаются ниже в календаре.</p>
        <form action={saveScheduleMode} className="grid">
          <div className="grid-3">
            <label>Шаг времени
              <select name="stepMinutes" defaultValue={String(stepMinutes)}>
                <option value="15">15 минут</option>
                <option value="30">30 минут</option>
                <option value="45">45 минут</option>
                <option value="60">1 час</option>
                <option value="90">1,5 часа</option>
                <option value="150">2,5 часа</option>
              </select>
            </label>
            <label>Рабочий день с
              <input name="defaultStartTime" type="time" defaultValue={defaultStartTime} />
            </label>
            <label>Рабочий день до
              <input name="defaultEndTime" type="time" defaultValue={defaultEndTime} />
            </label>
          </div>
          <div className="notice">Например: шаг 30 минут, рабочий день с 09:00 до 20:00. Все дни будут считаться рабочими по этому режиму, пока ты не отметишь конкретный день как выходной или особенный.</div>
          <button>Сохранить режим на каждый день</button>
        </form>
      </section>

      <section className="card" id="calendar">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Календарь окон</h2>
            <p>Выбери месяц и день. Рабочие, выходные и особенные дни будут отмечены цветом.</p>
          </div>
          <div className="actions">
            <a className="button secondary" href={`/admin/schedule?month=${month.prevKey}#calendar`}>← Пред. месяц</a>
            <span className="pill">{month.title}</span>
            <a className="button secondary" href={`/admin/schedule?month=${month.nextKey}#calendar`}>След. месяц →</a>
          </div>
        </div>

        <div className="calendar-grid calendar-head">
          {daysShort.map((day) => <b key={day}>{day}</b>)}
        </div>
        <div className="calendar-grid">
          {Array.from({ length: month.firstOffset }).map((_, index) => <div className="calendar-empty" key={`empty-${index}`} />)}
          {Array.from({ length: month.lastDay }).map((_, index) => {
            const dayNumber = index + 1;
            const day = new Date(month.year, month.monthIndex, dayNumber);
            const key = dateKey(day);
            const effective = getEffectiveDay(day, rules, overrides);
            const bookingsCount = monthBookings.filter((item) => dateKey(item.startAt) === key).length;
            const isSelected = selectedDateKey === key;
            const className = ["calendar-day", effective.isWorkingDay ? "day-working" : "day-off", effective.kind === "SPECIAL" ? "day-special" : "", isSelected ? "selected" : ""].join(" ");
            return (
              <a className={className} href={`/admin/schedule?month=${month.key}&date=${key}#book`} key={key}>
                <span className="day-number">{dayNumber}</span>
                <span>{dayStatusLabel(effective.kind, effective.isWorkingDay)}</span>
                {bookingsCount > 0 ? <small>{bookingsCount} запис.</small> : <small>свободно</small>}
              </a>
            );
          })}
        </div>
      </section>

      {selectedDay && selectedEffective ? (
        <section className="card" id="book">
          <h2>{formatDateOnly(selectedDay)}</h2>
          {warning ? <div className="notice danger-notice">Предупреждение: {warning}. Чтобы всё равно создать запись, поставь галочку подтверждения ниже.</div> : null}
          {success ? <div className="notice ok-notice">{success}</div> : null}

          <div className="grid-2">
            <div className="mini-card">
              <h3>Пометить день</h3>
              <form action={saveDayOverride} className="grid">
                <input type="hidden" name="date" value={selectedDateKey} />
                <input type="hidden" name="month" value={month.key} />
                <label>Тип дня
                  <select name="kind" defaultValue={selectedOverride?.kind || (selectedEffective.isWorkingDay ? "WORKING" : "DAY_OFF")}>
                    <option value="WORKING">Рабочий день</option>
                    <option value="DAY_OFF">Выходной</option>
                    <option value="SPECIAL">Особенный день</option>
                  </select>
                </label>
                <div className="grid-2">
                  <label>Начало<input name="startTime" type="time" defaultValue={selectedOverride?.startTime || selectedEffective.startTime} /></label>
                  <label>Конец<input name="endTime" type="time" defaultValue={selectedOverride?.endTime || selectedEffective.endTime} /></label>
                </div>
                <label>Заметка<input name="note" defaultValue={selectedOverride?.note || ""} placeholder="например: только вечер / личные дела" /></label>
                <button>Сохранить день</button>
              </form>
              {selectedOverride ? (
                <form action={deleteDayOverride} style={{ marginTop: 12 }}>
                  <input type="hidden" name="id" value={selectedOverride.id} />
                  <input type="hidden" name="month" value={month.key} />
                  <button className="secondary">Сбросить особую пометку</button>
                </form>
              ) : null}
            </div>

            <div className="mini-card">
              <h3>Окна дня</h3>
              {!selectedEffective.isWorkingDay ? <div className="notice">Этот день сейчас выходной. При записи система попросит подтверждение.</div> : null}
              <div className="time-list">
                {selectedTimes.map((time) => {
                  const state = getSlotState({ day: selectedDay, time, durationMinutes: stepMinutes, bookings: selectedBookings, blockedSlots: selectedBlocks });
                  return <span className={`time-pill ${state}`} key={time}>{time}</span>;
                })}
              </div>
              <p className="small">Свободные — светлые, занятые — розовые, закрытые — серые. Для длительной услуги система проверит наложение отдельно.</p>
            </div>
          </div>

          <div className="card soft-card">
            <h3>Создать запись на выбранный день</h3>
            {clients.length === 0 || services.length === 0 ? <div className="notice">Нужен хотя бы один подтверждённый клиент и одна активная услуга.</div> : (
              <form action={createScheduleBooking} className="grid">
                <input type="hidden" name="date" value={selectedDateKey} />
                <input type="hidden" name="month" value={month.key} />
                <div className="grid-3">
                  <label>Клиент
                    <select name="clientId" required>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.lastName} {client.firstName} — {client.phone}</option>)}
                    </select>
                  </label>
                  <label>Услуга
                    <select name="serviceId" required>
                      {services.map((service) => <option key={service.id} value={service.id}>{service.title} — {rub(service.price)}</option>)}
                    </select>
                  </label>
                  <label>Время начала
                    <select name="startTime" required>
                      {selectedTimes.map((time) => <option key={time} value={time}>{time}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid-3">
                  <label>Сколько времени займёт услуга
                    <select name="durationMinutes" defaultValue="150">
                      <option value="30">30 минут</option>
                      <option value="60">1 час</option>
                      <option value="90">1,5 часа</option>
                      <option value="120">2 часа</option>
                      <option value="150">2,5 часа</option>
                      <option value="180">3 часа</option>
                      <option value="210">3,5 часа</option>
                      <option value="240">4 часа</option>
                    </select>
                  </label>
                  <label>Итоговая цена<input name="finalPrice" type="number" min="0" placeholder="если отличается" /></label>
                  <label>Заметка<input name="adminComment" placeholder="например: дизайн / сложная коррекция" /></label>
                </div>
                <label className="inline-check"><input type="checkbox" name="force" /> Подтверждаю запись даже если это выходной, закрытое окно или есть наложение</label>
                <button>Создать запись</button>
              </form>
            )}
          </div>

          {selectedBookings.length > 0 ? (
            <div className="card soft-card">
              <h3>Активные записи в этот день</h3>
              <table className="table">
                <tbody>
                  {selectedBookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>{formatTimeOnly(booking.startAt)} — {formatTimeOnly(booking.endAt)}</td>
                      <td>{booking.client.lastName} {booking.client.firstName}</td>
                      <td>{booking.service.title}</td>
                      <td>{booking.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
