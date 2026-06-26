"use client";

import { DURATION_OPTIONS, durationLabel } from "@/lib/durations";
import { BOOKING_STATUS_OPTIONS, bookingStatusLabel } from "@/lib/statusLabels";
import { useEffect, useMemo, useState } from "react";
import { createScheduleBooking, saveBulkDayOverrides } from "./actions";
import { cancelScheduleBooking, confirmScheduleBooking, updateScheduleBooking } from "./bookingActions";

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
  kind: "free" | "booking" | "block";
  endTime?: string;
  booking?: {
    id: string;
    status: string;
    clientId: string;
    clientName: string;
    serviceId: string;
    serviceTitle: string;
    durationMinutes: number;
    finalPrice: number | null;
    clientComment: string;
    adminComment: string;
  };
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
  const [onlineSaveState, setOnlineSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [onlineSaveText, setOnlineSaveText] = useState("");
  const firstService = props.services[0];
  const [selectedServiceId, setSelectedServiceId] = useState(firstService?.id ?? "");
  const selectedService = props.services.find((service) => service.id === selectedServiceId) || firstService;
  const [manualDuration, setManualDuration] = useState(selectedService?.durationMinutes ?? 150);

  useEffect(() => {
    setOnlineTimes(props.currentOnlineTimes);
    setOnlineSaveState("idle");
    setOnlineSaveText("");
  }, [props.selectedDateKey, props.currentOnlineTimes]);

  const datesJson = JSON.stringify(paintDates);

  function toggleDate(key: string) {
    if (!paintMode) {
      window.location.href = `/admin/schedule?view=calendar&month=${props.monthKey}&date=${key}#selected-day`;
      return;
    }

    setPaintDates((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function addOnlineTime(time: string) {
    setOnlineTimes((current) => current.includes(time) ? current : [...current, time].sort());
  }

  function removeOnlineTime(time: string) {
    setOnlineTimes((current) => current.filter((item) => item !== time));
  }

  async function saveOnlineTimes() {
    setOnlineSaveState("saving");
    setOnlineSaveText("");
    try {
      const response = await fetch("/admin/schedule/save-online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: props.selectedDateKey, times: onlineTimes })
      });
      const data = await response.json().catch(() => null) as { saved?: number; skipped?: number } | null;
      if (!response.ok) throw new Error("save-failed");
      setOnlineSaveState("saved");
      setOnlineSaveText(`Сохранила онлайн-окна: ${data?.saved ?? onlineTimes.length}${data?.skipped ? `. Пропущено занятых: ${data.skipped}` : ""}.`);
    } catch {
      setOnlineSaveState("error");
      setOnlineSaveText("Не сохранилось. Обнови страницу и попробуй ещё раз.");
    }
  }

  const freeTimes = useMemo(() => props.selectedTimes.filter((item) => !item.isBusy), [props.selectedTimes]);
  const busyTimes = useMemo(() => props.selectedTimes.filter((item) => item.isBusy), [props.selectedTimes]);
  const visibleTopTimes = useMemo(() => freeTimes.filter((item) => !onlineTimes.includes(item.time)), [freeTimes, onlineTimes]);

  function handleServiceChange(value: string) {
    setSelectedServiceId(value);
    const service = props.services.find((item) => item.id === value);
    if (service) setManualDuration(service.durationMinutes);
  }

  return (
    <div className="grid schedule-calendar-workspace">
      <style jsx global>{`
        .paint-selected { outline: 4px solid rgba(196, 93, 132, .45) !important; transform: translateY(-2px); }
        .paint-off { background: linear-gradient(135deg, #bd5f82, #f2c7d7) !important; color: white !important; border-color: #a94e71 !important; }
        .paint-off .day-number, .paint-off small { color: white !important; }
        .paint-working { background: linear-gradient(135deg, #e5f3df, #ffffff) !important; border-color: #94bd8c !important; }
        .paint-special { background: linear-gradient(135deg, #f6bdd5, #f6e3ff) !important; border-color: #cf78a4 !important; }
      `}</style>

      <section className="card schedule-calendar-card" id="calendar">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Календарь</h2>
            <p>Обычный режим: нажми дату и ниже управляй записью. Кнопки ниже нужны только чтобы быстро отметить выходные или рабочие дни.</p>
          </div>
          <div className="actions">
            <a className="button secondary" href={`/admin/schedule?view=calendar&month=${props.prevKey}#calendar`}>← Пред. месяц</a>
            <span className="pill">{props.monthTitle}</span>
            <a className="button secondary" href={`/admin/schedule?view=calendar&month=${props.nextKey}#calendar`}>След. месяц →</a>
          </div>
        </div>

        <div className="actions schedule-paint-actions" style={{ marginTop: 14 }}>
          <span className="schedule-paint-label">Отметить дни:</span>
          {(["DAY_OFF", "WORKING", "SPECIAL"] as const).map((mode) => (
            <button type="button" key={mode} className={paintMode === mode ? "" : "secondary"} onClick={() => { setPaintMode((current) => current === mode ? "" : mode); setPaintDates([]); }}>
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
            const classes = ["calendar-day", day.isWorkingDay ? "day-working" : "day-off", day.kind === "SPECIAL" ? "day-special" : "", selectedDate ? "selected" : "", selectedForPaint ? "paint-selected" : "", selectedForPaint && paintMode === "DAY_OFF" ? "paint-off" : "", selectedForPaint && paintMode === "WORKING" ? "paint-working" : "", selectedForPaint && paintMode === "SPECIAL" ? "paint-special" : ""].join(" ");

            return (
              <button type="button" className={classes} key={day.key} onClick={() => toggleDate(day.key)} style={{ textAlign: "left", cursor: "pointer" }}>
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
        <section className="card schedule-selected-card" id="selected-day">
          <h2>{props.selectedDateTitle}</h2>
          {props.warning ? <div className="notice danger-notice">Предупреждение: {props.warning}. Чтобы всё равно создать запись, поставь галочку подтверждения.</div> : null}
          {props.success ? <div className="notice ok-notice">{props.success}</div> : null}

          <div className="grid-2">
            <div className="mini-card">
              <h3>Открыть окна для онлайн-записи</h3>
              <p className="small">Нажимай свободное время сверху — оно исчезнет из списка и уйдёт вниз. Нижний список — то, что увидят клиенты онлайн.</p>

              <div className="grid">
                <b>Свободное время дня</b>
                <div className="time-list" style={{ maxHeight: 360 }}>
                  {visibleTopTimes.map((item) => <button type="button" key={item.time} onClick={() => addOnlineTime(item.time)} title="Свободно">{item.time}</button>)}
                  {visibleTopTimes.length === 0 ? <div className="notice">Свободных времён для переноса вниз нет.</div> : null}
                </div>
              </div>

              <div className="grid" style={{ marginTop: 16 }}>
                <b>Окна для клиентов онлайн</b>
                <div className="time-list" style={{ maxHeight: 280 }}>
                  {onlineTimes.map((time) => <button type="button" className="ok" key={time} onClick={() => removeOnlineTime(time)}>{time} ×</button>)}
                  {onlineTimes.length === 0 ? <div className="notice">Пока не выбрано ни одного онлайн-окна.</div> : null}
                </div>

                {onlineSaveText ? <div className={`notice ${onlineSaveState === "error" ? "danger-notice" : "ok-notice"}`}>{onlineSaveText}</div> : null}
                <button type="button" onClick={saveOnlineTimes} disabled={onlineSaveState === "saving"}>{onlineSaveState === "saving" ? "Сохраняю…" : "Готово — сохранить онлайн-окна"}</button>
              </div>
            </div>

            <div className="mini-card" id="manual-booking">
              <h3>Записать самой</h3>
              <p className="small">Занятые и ожидающие подтверждения окна теперь видны отдельно. Нажми на занятое окно, чтобы открыть управление записью.</p>

              <div className="grid">
                <b>Список времени</b>
                <div className="grid" style={{ maxHeight: 310, overflow: "auto", paddingRight: 6 }}>
                  {props.selectedTimes.map((item) => {
                    const booking = item.booking;
                    if (item.kind === "booking" && booking) {
                      return (
                        <details key={`${item.kind}-${item.time}`} className={`slot busy-slot ${booking.status === "PENDING" ? "pending" : "confirmed"}`} style={{ padding: "10px 12px", display: "block" }}>
                          <summary><b>{item.time}</b> — {item.busyLabel}</summary>
                          <div className="busy-slot-panel">
                            <span className={booking.status === "PENDING" ? "status wait" : "status ok-status"}>{bookingStatusLabel(booking.status)}</span>
                            <small>Клиент: {booking.clientName}. Услуга: {booking.serviceTitle}.</small>
                            {booking.clientComment ? <small>Комментарий клиента: {booking.clientComment}</small> : null}

                            {booking.status === "PENDING" ? (
                              <form action={confirmScheduleBooking}>
                                <input type="hidden" name="id" value={booking.id} />
                                <input type="hidden" name="month" value={props.monthKey} />
                                <input type="hidden" name="date" value={props.selectedDateKey} />
                                <button className="ok">Подтвердить</button>
                              </form>
                            ) : null}

                            <form action={updateScheduleBooking} className="grid">
                              <input type="hidden" name="id" value={booking.id} />
                              <input type="hidden" name="month" value={props.monthKey} />
                              <input type="hidden" name="date" value={props.selectedDateKey} />
                              <label>Клиент<select name="clientId" defaultValue={booking.clientId}>{props.clients.map((client) => <option key={client.id} value={client.id}>{client.name} — {client.phone}</option>)}</select></label>
                              <label>Услуга<select name="serviceId" defaultValue={booking.serviceId}>{props.services.map((service) => <option key={service.id} value={service.id}>{service.title} — {service.price} ₽ · {durationLabel(service.durationMinutes)}</option>)}</select></label>
                              <div className="grid-2">
                                <label>Время начала<select name="startTime" defaultValue={item.time}>{props.selectedTimes.filter((time) => !time.isBusy || time.time === item.time).map((time) => <option key={time.time} value={time.time}>{time.time}</option>)}</select></label>
                                <label>Длительность<select name="durationMinutes" defaultValue={booking.durationMinutes}>{DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                              </div>
                              <div className="grid-2">
                                <label>Статус<select name="status" defaultValue={booking.status}>{BOOKING_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
                                <label>Итоговая цена<input name="finalPrice" type="number" min="0" defaultValue={booking.finalPrice ?? ""} /></label>
                              </div>
                              <label>Заметка<input name="adminComment" defaultValue={booking.adminComment} /></label>
                              <button>Сохранить изменения</button>
                            </form>

                            <form action={cancelScheduleBooking}>
                              <input type="hidden" name="id" value={booking.id} />
                              <input type="hidden" name="month" value={props.monthKey} />
                              <input type="hidden" name="date" value={props.selectedDateKey} />
                              <button className="danger">Отменить запись</button>
                            </form>
                          </div>
                        </details>
                      );
                    }

                    return <div key={`${item.kind}-${item.time}`} className={item.isBusy ? "notice danger-notice" : "slot"} style={{ padding: "10px 12px", display: "block" }}><b>{item.time}</b>{item.busyLabel ? ` — ${item.busyLabel}` : " — свободно"}</div>;
                  })}
                </div>
              </div>

              {props.clients.length === 0 || props.services.length === 0 ? <div className="notice">Нужен хотя бы один подтверждённый клиент и одна активная услуга.</div> : (
                <form action={createScheduleBooking} className="grid" style={{ marginTop: 16 }}>
                  <input type="hidden" name="date" value={props.selectedDateKey} />
                  <input type="hidden" name="month" value={props.monthKey} />
                  <label>Клиент<select name="clientId" required>{props.clients.map((client) => <option key={client.id} value={client.id}>{client.name} — {client.phone}</option>)}</select></label>
                  <label>Услуга<select name="serviceId" required value={selectedServiceId} onChange={(event) => handleServiceChange(event.target.value)}>{props.services.map((service) => <option key={service.id} value={service.id}>{service.title} — {service.price} ₽ · {durationLabel(service.durationMinutes)}</option>)}</select></label>
                  <div className="grid-2">
                    <label>Время начала<select name="startTime" required>{freeTimes.map((item) => <option key={item.time} value={item.time}>{item.time}</option>)}</select></label>
                    <label>Сколько времени займёт услуга<select name="durationMinutes" value={manualDuration} onChange={(event) => setManualDuration(Number(event.target.value))}>{DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  </div>
                  <div className="grid-2">
                    <label>Итоговая цена<input name="finalPrice" type="number" min="0" placeholder="если отличается" /></label>
                    <label>Заметка<input name="adminComment" placeholder="например: дизайн / сложная коррекция" /></label>
                  </div>
                  {!props.selectedIsWorkingDay ? <div className="notice">Этот день отмечен как выходной. Система попросит подтверждение, если нажать запись без галочки.</div> : null}
                  {freeTimes.length === 0 ? <div className="notice danger-notice">Свободного старта для записи в этот день нет.</div> : null}
                  <label className="inline-check"><input type="checkbox" name="force" />Подтверждаю запись даже если это выходной, закрытое окно или есть наложение</label>
                  <button disabled={freeTimes.length === 0}>Записать клиента</button>
                </form>
              )}
            </div>
          </div>
        </section>
      ) : <section className="card"><h2>Выбери день</h2><p>Нажми на дату в календаре, чтобы открыть список времени, ручную запись и выбор онлайн-окон.</p></section>}
    </div>
  );
}
