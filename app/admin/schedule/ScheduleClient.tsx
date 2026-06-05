"use client";

import { useMemo, useState } from "react";
import { createScheduleBooking, saveBulkDayOverrides, saveOnlineWindows } from "./actions";

type DayItem = {
  key: string;
  dayNumber: number;
  label: string;
  kind: string;
  isWorkingDay: boolean;
  bookingsCount: number;
  onlineCount: number;
};

type TimeItem = {
  time: string;
  busyLabel: string;
  isBusy: boolean;
  isOnline: boolean;
};

type ClientItem = { id: string; name: string; phone: string };
type ServiceItem = { id: string; title: string; price: number; durationMinutes: number };

type Props = {
  monthKey: string;
  monthTitle: string;
  prevKey: string;
  nextKey: string;
  firstOffset: number;
  days: DayItem[];
  selectedDateKey: string;
  selectedDateTitle: string;
  selectedIsWorkingDay: boolean;
  selectedTimes: TimeItem[];
  currentOnlineTimes: string[];
  clients: ClientItem[];
  services: ServiceItem[];
  warning: string;
  success: string;
};

const modeLabels: Record<string, string> = {
  DAY_OFF: "Выходной",
  WORKING: "Рабочий",
  SPECIAL: "Особенный"
};

export default function ScheduleClient(props: Props) {
  const [paintMode, setPaintMode] = useState<"DAY_OFF" | "WORKING" | "SPECIAL" | "">("");
  const [paintDates, setPaintDates] = useState<string[]>([]);
  const [onlineTimes, setOnlineTimes] = useState<string[]>(props.currentOnlineTimes);

  const datesJson = JSON.stringify(paintDates);
  const timesJson = JSON.stringify(onlineTimes);

  function toggleDate(key: string) {
    if (!paintMode) {
      window.location.href = `/admin/schedule?month=${props.monthKey}&date=${key}#selected-day`;
      return;
    }

    setPaintDates((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  function addOnlineTime(time: string) {
    setOnlineTimes((current) => current.includes(time) ? current : [...current, time].sort());
  }

  function removeOnlineTime(time: string) {
    setOnlineTimes((current) => current.filter((item) => item !== time));
  }

  const visibleTopTimes = useMemo(
    () => props.selectedTimes.filter((item) => !onlineTimes.includes(item.time)),
    [props.selectedTimes, onlineTimes]
  );

  return (
    <div className="grid">
      <style jsx global>{`
        .paint-selected { outline: 4px solid rgba(196, 93, 132, .45) !important; transform: translateY(-2px); }
        .paint-off { background: linear-gradient(135deg, #bd5f82, #f2c7d7) !important; color: white !important; border-color: #a94e71 !important; }
        .paint-off .day-number, .paint-off small { color: white !important; }
        .paint-working { background: linear-gradient(135deg, #e5f3df, #ffffff) !important; border-color: #94bd8c !important; }
        .paint-special { background: linear-gradient(135deg, #f6bdd5, #f6e3ff) !important; border-color: #cf78a4 !important; }
      `}</style>
      <section className="card" id="calendar">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Календарь окон</h2>
            <p>Зажми режим сверху, нажимай даты — они отметятся цветом. Потом нажми “Готово”, чтобы сохранить.</p>
          </div>
          <div className="actions">
            <a className="button secondary" href={`/admin/schedule?month=${props.prevKey}#calendar`}>← Пред. месяц</a>
            <span className="pill">{props.monthTitle}</span>
            <a className="button secondary" href={`/admin/schedule?month=${props.nextKey}#calendar`}>След. месяц →</a>
          </div>
        </div>

        <div className="actions" style={{ marginTop: 14 }}>
          {(["DAY_OFF", "WORKING", "SPECIAL"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              className={paintMode === mode ? "" : "secondary"}
              onClick={() => {
                setPaintMode((current) => current === mode ? "" : mode);
                setPaintDates([]);
              }}
            >
              {modeLabels[mode]}
            </button>
          ))}
          {paintMode ? <button type="button" className="secondary" onClick={() => { setPaintMode(""); setPaintDates([]); }}>Отмена</button> : null}
        </div>

        {paintMode ? (
          <form action={saveBulkDayOverrides} className="notice" style={{ marginTop: 12 }}>
            <input type="hidden" name="month" value={props.monthKey} />
            <input type="hidden" name="kind" value={paintMode} />
            <input type="hidden" name="datesJson" value={datesJson} />
            <input type="hidden" name="startTime" value="" />
            <input type="hidden" name="endTime" value="" />
            <b>Режим: {modeLabels[paintMode]}</b>
            <p style={{ margin: "6px 0 12px" }}>Выбрано дат: {paintDates.length}. Нажми “Готово”, чтобы сохранить эти дни.</p>
            <button disabled={paintDates.length === 0}>Готово — сохранить даты</button>
          </form>
        ) : null}

        <div className="calendar-grid calendar-head">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <b key={day}>{day}</b>)}
        </div>

        <div className="calendar-grid">
          {Array.from({ length: props.firstOffset }).map((_, index) => <div className="calendar-empty" key={`empty-${index}`} />)}
          {props.days.map((day) => {
            const selectedForPaint = paintDates.includes(day.key);
            const selectedDate = props.selectedDateKey === day.key;
            const classes = [
              "calendar-day",
              day.isWorkingDay ? "day-working" : "day-off",
              day.kind === "SPECIAL" ? "day-special" : "",
              selectedDate ? "selected" : "",
              selectedForPaint ? "paint-selected" : "",
              selectedForPaint && paintMode === "DAY_OFF" ? "paint-off" : "",
              selectedForPaint && paintMode === "WORKING" ? "paint-working" : "",
              selectedForPaint && paintMode === "SPECIAL" ? "paint-special" : ""
            ].join(" ");

            return (
              <button
                type="button"
                className={classes}
                key={day.key}
                onClick={() => toggleDate(day.key)}
                style={{ textAlign: "left", cursor: "pointer" }}
              >
                <span className="day-number">{day.dayNumber}</span>
                <span>{day.label}</span>
                <small>{day.bookingsCount ? `${day.bookingsCount} запис.` : "нет записей"}</small>
                <small>{day.onlineCount ? `${day.onlineCount} онлайн-окон` : "онлайн-окон нет"}</small>
              </button>
            );
          })}
        </div>
      </section>

      {props.selectedDateKey ? (
        <section className="card" id="selected-day">
          <h2>{props.selectedDateTitle}</h2>
          {props.warning ? <div className="notice danger-notice">Предупреждение: {props.warning}. Чтобы всё равно создать запись, поставь галочку подтверждения.</div> : null}
          {props.success ? <div className="notice ok-notice">{props.success}</div> : null}

          <div className="grid-2">
            <div className="mini-card">
              <h3>Открыть окна для онлайн-записи</h3>
              <p className="small">Нажимай время сверху — оно исчезнет из списка и уйдёт вниз. Нижний список — то, что увидят клиенты для записи онлайн.</p>

              <div className="grid">
                <b>Доступное время дня</b>
                <div className="time-list" style={{ maxHeight: 360 }}>
                  {visibleTopTimes.map((item) => (
                    <button
                      type="button"
                      className={item.isBusy ? "secondary" : ""}
                      key={item.time}
                      onClick={() => addOnlineTime(item.time)}
                      title={item.busyLabel || "Свободно"}
                    >
                      {item.time}{item.isBusy ? " · занято" : ""}
                    </button>
                  ))}
                  {visibleTopTimes.length === 0 ? <div className="notice">Все времена уже перенесены вниз.</div> : null}
                </div>
              </div>

              <form action={saveOnlineWindows} className="grid" style={{ marginTop: 16 }}>
                <input type="hidden" name="date" value={props.selectedDateKey} />
                <input type="hidden" name="month" value={props.monthKey} />
                <input type="hidden" name="timesJson" value={timesJson} />

                <b>Окна для клиентов онлайн</b>
                <div className="time-list" style={{ maxHeight: 280 }}>
                  {onlineTimes.map((time) => (
                    <button type="button" className="ok" key={time} onClick={() => removeOnlineTime(time)}>
                      {time} ×
                    </button>
                  ))}
                  {onlineTimes.length === 0 ? <div className="notice">Пока не выбрано ни одного онлайн-окна.</div> : null}
                </div>

                <button>Готово — сохранить онлайн-окна</button>
              </form>
            </div>

            <div className="mini-card" id="manual-booking">
              <h3>Записать самой</h3>
              <p className="small">Для ручной записи показывается весь список времени, а занятые места подписаны клиентом. Наложение можно подтвердить отдельно.</p>

              <div className="grid">
                <b>Список времени</b>
                <div className="grid" style={{ maxHeight: 310, overflow: "auto", paddingRight: 6 }}>
                  {props.selectedTimes.map((item) => (
                    <div
                      key={item.time}
                      className={item.isBusy ? "notice danger-notice" : "slot"}
                      style={{ padding: "10px 12px", display: "block" }}
                    >
                      <b>{item.time}</b>{item.busyLabel ? ` — ${item.busyLabel}` : " — свободно"}
                    </div>
                  ))}
                </div>
              </div>

              {props.clients.length === 0 || props.services.length === 0 ? (
                <div className="notice">Нужен хотя бы один подтверждённый клиент и одна активная услуга.</div>
              ) : (
                <form action={createScheduleBooking} className="grid" style={{ marginTop: 16 }}>
                  <input type="hidden" name="date" value={props.selectedDateKey} />
                  <input type="hidden" name="month" value={props.monthKey} />

                  <label>Клиент
                    <select name="clientId" required>
                      {props.clients.map((client) => <option key={client.id} value={client.id}>{client.name} — {client.phone}</option>)}
                    </select>
                  </label>

                  <label>Услуга
                    <select name="serviceId" required>
                      {props.services.map((service) => <option key={service.id} value={service.id}>{service.title} — {service.price} ₽</option>)}
                    </select>
                  </label>

                  <div className="grid-2">
                    <label>Время начала
                      <select name="startTime" required>
                        {props.selectedTimes.map((item) => <option key={item.time} value={item.time}>{item.time}{item.busyLabel ? ` — ${item.busyLabel}` : ""}</option>)}
                      </select>
                    </label>
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
                  </div>

                  <div className="grid-2">
                    <label>Итоговая цена<input name="finalPrice" type="number" min="0" placeholder="если отличается" /></label>
                    <label>Заметка<input name="adminComment" placeholder="например: дизайн / сложная коррекция" /></label>
                  </div>

                  {!props.selectedIsWorkingDay ? <div className="notice">Этот день отмечен как выходной. Система попросит подтверждение, если нажать запись без галочки.</div> : null}

                  <label className="inline-check">
                    <input type="checkbox" name="force" />
                    Подтверждаю запись даже если это выходной, закрытое окно или есть наложение
                  </label>

                  <button>Записать клиента</button>
                </form>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Выбери день</h2>
          <p>Нажми на дату в календаре, чтобы открыть список времени, ручную запись и выбор онлайн-окон.</p>
        </section>
      )}
    </div>
  );
}
