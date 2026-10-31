"use client";

import SubmitButton from "@/app/SubmitButton";
import { useRouter } from "next/navigation";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createBooking } from "@/app/actions";
import { businessDateKey, businessDateFromKey, businessMonthKey, formatInBusinessTime } from "@/lib/timezone";

type WindowItem = {
  id: string;
  startAt: string;
  busy: boolean;
  availableServiceIds: string[];
};

type ServiceItem = {
  id: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  price: number;
};

type ClientInfo = {
  firstName: string;
  lastName: string;
  phone: string;
};

type Props = {
  rescheduleId?: string;
  initialServiceId?: string;
  todayDate: string;
  client: ClientInfo;
  windows: WindowItem[];
  services: ServiceItem[];
  initialDate: string;
  initialTime?: string;
};

function upperFirst(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function dayKey(value: string | Date) {
  return businessDateKey(value);
}

function monthKey(value: string | Date) {
  return businessMonthKey(value);
}

function fmtDate(value: string | Date) {
  return upperFirst(formatInBusinessTime(value, { day: "numeric", month: "long", weekday: "long" }));
}

function fmtMonth(value: string | Date) {
  return upperFirst(formatInBusinessTime(value, { month: "long", year: "numeric" }));
}

function fmtTime(value: string | Date) {
  return formatInBusinessTime(value, { hour: "2-digit", minute: "2-digit" });
}

function rub(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
}

function daysInMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function monthOffset(date: Date) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return (first.getUTCDay() + 6) % 7;
}

function monthStart(key: string) {
  return new Date(`${key}-01T12:00:00.000Z`);
}

function addMonths(key: string, offset: number) {
  const date = monthStart(key);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function ClientBookingPicker({ rescheduleId, initialServiceId, todayDate, client, windows, services, initialDate, initialTime = "" }: Props) {
  const router = useRouter();
  const [bookingState, submitBooking] = useActionState(createBooking, { error: "" });
  const [selectedServiceId, setSelectedServiceId] = useState(services.find((item) => item.id === initialServiceId)?.id || services[0]?.id || "");
  const [comment, setComment] = useState("");
  const selectedService = services.find((service) => service.id === selectedServiceId);
  const serviceWindows = useMemo(() => windows.map((item) => ({ ...item, busy: !item.availableServiceIds.includes(selectedServiceId) })), [windows, selectedServiceId]);
  const windowsByDate = useMemo(() => {
    const map = new Map<string, WindowItem[]>();
    for (const item of serviceWindows) { const key = dayKey(item.startAt); map.set(key, [...(map.get(key) || []), item]); }
    return map;
  }, [serviceWindows]);
  const freeDateKeys = useMemo(() => new Set(serviceWindows.filter((item) => !item.busy).map((item) => dayKey(item.startAt))), [serviceWindows]);
  const activeDateKeys = useMemo(() => new Set(serviceWindows.map((item) => dayKey(item.startAt))), [serviceWindows]);
  const firstFreeDate = Array.from(freeDateKeys).sort()[0] || initialDate;
  const currentMonthKey = todayDate.slice(0, 7);
  const [visibleMonthKey, setVisibleMonthKey] = useState((initialDate || firstFreeDate).slice(0, 7));
  const [selectedDateKey, setSelectedDateKey] = useState(initialDate || firstFreeDate);
  const [mode, setMode] = useState<"calendar" | "list">("calendar");
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const availableMonthKeys = useMemo(() => Array.from(new Set(windows.map((item) => monthKey(item.startAt)))).sort(), [windows]);
  const maxMonthKey = availableMonthKeys[availableMonthKeys.length - 1] || currentMonthKey;
  const visibleMonth = useMemo(() => monthStart(visibleMonthKey), [visibleMonthKey]);
  const showPrev = visibleMonthKey > currentMonthKey;
  const showNext = visibleMonthKey < maxMonthKey;
  const monthDays = useMemo(() => Array.from({ length: daysInMonth(visibleMonth) }, (_, index) => index + 1), [visibleMonth]);
  const selectedWindows = windowsByDate.get(selectedDateKey) || [];
  const selectedFreeCount = selectedWindows.filter((item) => !item.busy).length;
  const selectedBusyCount = selectedWindows.length - selectedFreeCount;
  const selectedWindow = selectedWindows.find((item) => item.startAt === selectedTime && !item.busy);
  const groupedFreeWindows = useMemo(() => Array.from(windowsByDate.entries()).map(([date, items]) => ({ date, items: items.filter((item) => !item.busy) })).filter((group) => group.items.length > 0).sort((a, b) => a.date.localeCompare(b.date)), [windowsByDate]);
  useEffect(() => { if (bookingState.error) router.refresh(); }, [bookingState, router]);

  function chooseDate(key: string) { setSelectedDateKey(key); setVisibleMonthKey(key.slice(0, 7)); setSelectedTime(""); }
  function changeMonth(nextKey: string) {
    setVisibleMonthKey(nextKey);
    const first = serviceWindows.find((item) => monthKey(item.startAt) === nextKey && !item.busy) || serviceWindows.find((item) => monthKey(item.startAt) === nextKey);
    setSelectedDateKey(first ? dayKey(first.startAt) : `${nextKey}-01`); setSelectedTime("");
  }
  function chooseWindow(window: WindowItem) { setSelectedDateKey(dayKey(window.startAt)); setVisibleMonthKey(monthKey(window.startAt)); setSelectedTime(window.startAt); }

  return (
    <>
      <section className="card" aria-label="Выбор услуги">
        <h2>1. Выберите услугу</h2>
        <p>Свободное время ниже учитывает её длительность.</p>
        <div className="compact-service-switch" role="radiogroup" aria-label="Основная услуга">
          {services.map((service) => <button key={service.id} type="button" role="radio" aria-checked={selectedServiceId === service.id} className={selectedServiceId === service.id ? "active" : ""} onClick={() => { setSelectedServiceId(service.id); setSelectedTime(""); }}><b>{service.title}</b><small>{service.durationMinutes} мин · {rub(service.price)}</small></button>)}
        </div>
        {!services.length ? <p className="notice">Мастер пока не добавил услуги для онлайн-записи.</p> : null}
        {bookingState.error ? <p className="notice danger-notice" role="alert">{bookingState.error}</p> : null}
      </section>
      <section className="booking-view-switch" aria-label="Режим выбора времени">
        <div>
          <b>Свободное время</b>
          <p>Выберите день или посмотрите все окна списком.</p>
        </div>
        <div className="segmented-switch">
          <button type="button" className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}>Календарь</button>
          <button type="button" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>Список</button>
        </div>
      </section>

      {mode === "calendar" ? (
      <section className="calendar-layout" id="windows">
        <article className="calendar-card">
          <h2>Выберите день</h2>
          <div className="calendar-month-switcher">
            {showPrev ? (
              <button type="button" className="month-arrow" onClick={() => changeMonth(addMonths(visibleMonthKey, -1))} aria-label="Предыдущий месяц">‹</button>
            ) : <span className="month-arrow-placeholder" />}
            <b>{fmtMonth(visibleMonth)}</b>
            {showNext ? (
              <button type="button" className="month-arrow" onClick={() => changeMonth(addMonths(visibleMonthKey, 1))} aria-label="Следующий месяц">›</button>
            ) : <span className="month-arrow-placeholder" />}
          </div>
          <div className="calendar-legend">
            <span><i className="legend-dot blue-dot" /> свободно</span>
            <span><i className="legend-dot gray-dot" /> занято</span>
          </div>
          <div className="calendar-head">{["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {Array.from({ length: monthOffset(visibleMonth) }).map((_, index) => <span className="day-btn muted" key={`empty-${index}`}></span>)}
            {monthDays.map((day) => {
              const key = `${visibleMonth.getUTCFullYear()}-${String(visibleMonth.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayWindows = windowsByDate.get(key) || [];
              const freeCount = dayWindows.filter((item) => !item.busy).length;
              const busyCount = dayWindows.length - freeCount;
              const isWorkDay = activeDateKeys.has(key);
              const active = key === selectedDateKey;
              return isWorkDay ? (
                <button key={key} type="button" className={active ? "day-btn active" : "day-btn"} onClick={() => chooseDate(key)}>
                  <span>{day}</span>
                  <span className="day-dots">
                    {freeCount > 0 ? <i className="dot blue-dot" title="Есть свободное окно" /> : null}
                    {busyCount > 0 ? <i className="dot gray-dot" title="Есть занятое окно" /> : null}
                  </span>
                </button>
              ) : (
                <span key={key} className="day-btn muted" aria-disabled="true"><span>{day}</span></span>
              );
            })}
          </div>
        </article>

        <article className="selected-day-card card booking-step-card" id="selected-day">
          <p className="muted">Выбранная дата</p>
          <h2>{fmtDate(businessDateFromKey(selectedDateKey))}</h2>
          <p>{selectedFreeCount} свободно · {selectedBusyCount} занято</p>

          <div className="booking-step-panel">
              <div className="flow-step-title"><span>Шаг 2</span><h3>Выберите время</h3><p>Нажмите на свободное окно.</p></div>

              <div className="time-grid">
                {selectedWindows.map((window) => {
                  const active = selectedTime === window.startAt;
                  return window.busy ? (
                    <span key={window.id} className="time-btn busy" aria-disabled="true"><b>{fmtTime(window.startAt)}</b><span>Не подходит</span></span>
                  ) : (
                    <button key={window.id} type="button" className={active ? "time-btn free active" : "time-btn free"} onClick={() => chooseWindow(window)}>
                      <b>{fmtTime(window.startAt)}</b><span>Свободно</span>
                    </button>
                  );
                })}
                {selectedWindows.length === 0 ? <div className="empty-state"><p>На эту дату открытых окон нет.</p></div> : null}
              </div>
          </div>
        </article>
      </section>
      ) : (
        <section className="free-window-list-card card" id="windows">
          <div className="flow-step-title"><span>Шаг 2</span><h2>Свободные окна</h2><p>Нажмите на удобное время.</p></div>
          <div className="free-window-list">
            {groupedFreeWindows.map((group) => (
              <div className={selectedDateKey === group.date ? "free-window-row active" : "free-window-row"} key={group.date}>
                <b>{formatInBusinessTime(businessDateFromKey(group.date), { day: "2-digit", weekday: "short" }).replace(".", "")}</b>
                <span className="inline-times">
                  {group.items.map((window, index) => (
                    <span key={window.id}>
                      <button type="button" className={selectedTime === window.startAt ? "active" : ""} onClick={() => chooseWindow(window)}>{fmtTime(window.startAt)}</button>{index < group.items.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </span>
              </div>
            ))}
            {groupedFreeWindows.length === 0 ? <div className="empty-state">Свободных окон пока нет.</div> : null}
          </div>
        </section>
      )}

      {selectedWindow ? (
        <section className="card booking-builder booking-final-card" id="booking-builder">
          <h2>3. Проверьте запись</h2>
          {rescheduleId ? <p className="notice">После успешной отправки новая заявка заменит прежнюю запись.</p> : null}

          <form action={submitBooking} className="booking-builder-form compact-booking-form">
            <input type="hidden" name="rescheduleId" value={rescheduleId || ""} />
            <input type="hidden" name="startAt" value={selectedWindow.startAt} />
            <input type="hidden" name="returnDate" value={selectedDateKey} />
            <input type="hidden" name="returnTime" value={selectedWindow.startAt} />
            <input type="hidden" name="serviceId" value={selectedService?.id || ""} />

            <div className="selected-summary-panel">
              <div><span>Дата и время</span><b>{fmtDate(selectedWindow.startAt)}, {fmtTime(selectedWindow.startAt)}</b></div>
              <div><span>Услуга</span><b>{selectedService?.title || "Выберите услугу"}</b>{selectedService ? <small>{selectedService.durationMinutes} мин · {rub(selectedService.price)}</small> : null}</div>
              <div><span>Клиент</span><b>{client.firstName} {client.lastName}</b><small>{client.phone}</small></div>
            </div>

            <p className="owner-warning">Проверьте имя, услугу и время записи.</p>

            <div className="notice final-check-note">
              <b>После заявки напишите мастеру</b>
              <p>Сайт в тестовом режиме. Мастер проверит и подтвердит запись.</p>
            </div>

            <label className="comment-box">Комментарий, если нужно<textarea name="comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: хочу френч / ремонт ногтя / дизайн / есть ограничение по времени" /></label>

            <div className="final-confirm-card">
              <div>
                <h3>Всё верно?</h3>
                <p>Окно закрепится за вами. Запись подтвердит мастер.</p>
              </div>
              <SubmitButton disabled={!selectedService} pendingText="Отправляю…">{rescheduleId ? "Подтвердить перенос" : "Отправить заявку"}</SubmitButton>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
