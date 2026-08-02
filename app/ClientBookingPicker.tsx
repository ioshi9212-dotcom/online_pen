"use client";

import { useMemo, useState } from "react";
import { createBooking } from "@/app/actions";
import { businessDateKey, businessMonthKey, formatInBusinessTime } from "@/lib/timezone";

type WindowItem = {
  id: string;
  startAt: string;
  busy: boolean;
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
  token: string;
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
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthOffset(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return (first.getDay() + 6) % 7;
}

function monthStart(key: string) {
  return new Date(`${key}-01T00:00:00`);
}

function addMonths(key: string, offset: number) {
  const date = monthStart(key);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function ClientBookingPicker({ token, client, windows, services, initialDate, initialTime = "" }: Props) {
  const windowsByDate = useMemo(() => {
    const map = new Map<string, WindowItem[]>();
    for (const item of windows) {
      const key = dayKey(item.startAt);
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [windows]);

  const freeDateKeys = useMemo(() => new Set(windows.filter((item) => !item.busy).map((item) => dayKey(item.startAt))), [windows]);
  const activeDateKeys = useMemo(() => new Set(windows.map((item) => dayKey(item.startAt))), [windows]);
  const firstFreeDate = useMemo(() => Array.from(freeDateKeys).sort()[0] || initialDate || dayKey(new Date()), [freeDateKeys, initialDate]);
  const currentMonthKey = monthKey(new Date());
  const [visibleMonthKey, setVisibleMonthKey] = useState(monthKey(initialDate || firstFreeDate));
  const [selectedDateKey, setSelectedDateKey] = useState(initialDate || firstFreeDate);
  const [mode, setMode] = useState<"calendar" | "list">("calendar");
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id || "");
  const [selectedTime, setSelectedTime] = useState(initialTime);

  const availableMonthKeys = useMemo(() => Array.from(new Set(windows.map((item) => monthKey(item.startAt)))).sort(), [windows]);
  const maxMonthKey = availableMonthKeys[availableMonthKeys.length - 1] || currentMonthKey;
  const visibleMonth = monthStart(visibleMonthKey);
  const showPrev = visibleMonthKey > currentMonthKey;
  const showNext = visibleMonthKey < maxMonthKey;

  const monthDays = useMemo(() => Array.from({ length: daysInMonth(visibleMonth) }, (_, index) => index + 1), [visibleMonthKey]);
  const selectedWindows = useMemo(() => windowsByDate.get(selectedDateKey) || [], [windowsByDate, selectedDateKey]);
  const selectedFreeCount = selectedWindows.filter((item) => !item.busy).length;
  const selectedBusyCount = selectedWindows.length - selectedFreeCount;
  const selectedWindow = selectedWindows.find((item) => item.startAt === selectedTime && !item.busy);
  const selectedService = services.find((service) => service.id === selectedServiceId);
  const groupedFreeWindows = useMemo(() => Array.from(windowsByDate.entries())
    .map(([date, items]) => ({ date, items: items.filter((item) => !item.busy) }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date)), [windowsByDate]);

  function chooseDate(key: string) {
    setSelectedDateKey(key);
    setVisibleMonthKey(monthKey(key));
    setSelectedTime("");
  }

  function changeMonth(nextKey: string) {
    setVisibleMonthKey(nextKey);
    const firstFreeInMonth = windows.find((item) => monthKey(item.startAt) === nextKey && !item.busy);
    if (firstFreeInMonth) {
      chooseDate(dayKey(firstFreeInMonth.startAt));
      return;
    }
    const firstWindowInMonth = windows.find((item) => monthKey(item.startAt) === nextKey);
    if (firstWindowInMonth) {
      chooseDate(dayKey(firstWindowInMonth.startAt));
      return;
    }
    setSelectedDateKey(`${nextKey}-01`);
    setSelectedTime("");
  }

  function chooseWindow(window: WindowItem) {
    setSelectedDateKey(dayKey(window.startAt));
    setVisibleMonthKey(monthKey(window.startAt));
    setSelectedTime(window.startAt);
  }

  return (
    <>
      <section className="booking-view-switch" aria-label="Режим выбора времени">
        <div>
          <b>Как удобнее искать время?</b>
          <p>Календарь — открыть конкретный день. Список — увидеть все ближайшие свободные окна сразу. Услуга время не прячет.</p>
        </div>
        <div className="segmented-switch">
          <button type="button" className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}>Календарь</button>
          <button type="button" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>Список</button>
        </div>
      </section>

      {mode === "calendar" ? (
      <section className="calendar-layout" id="windows">
        <article className="calendar-card">
          <h2>Ближайшие свободные даты</h2>
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
              const key = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
          <h2>{fmtDate(`${selectedDateKey}T00:00:00`)}</h2>
          <p>Занято окон: {selectedBusyCount} · Свободно окон: {selectedFreeCount}</p>

          <div className="booking-step-panel">
              <div className="flow-step-title"><span>Шаг 1</span><h3>Выберите время</h3><p>Свободное и занятое видно сразу. Услугу отметите ниже — она не должна играть с вами в прятки.</p></div>

              <div className="time-grid">
                {selectedWindows.map((window) => {
                  const active = selectedTime === window.startAt;
                  return window.busy ? (
                    <span key={window.id} className="time-btn busy" aria-disabled="true"><b>{fmtTime(window.startAt)}</b><span>Занято</span></span>
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
          <div className="flow-step-title"><span>Шаг 1</span><h2>Ближайшие свободные окна</h2><p>Только свободное время. Нажмите на время в нужной строке — без обхода каждого дня календаря.</p></div>
          <div className="free-window-list">
            {groupedFreeWindows.map((group) => (
              <div className={selectedDateKey === group.date ? "free-window-row active" : "free-window-row"} key={group.date}>
                <b>{formatInBusinessTime(`${group.date}T00:00:00`, { day: "2-digit", weekday: "short" }).replace(".", "")}</b>
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
          <div className="section-head">
            <div>
              <p className="muted">Шаг 2</p>
              <h2>Что будем делать</h2>
              <p>Выберите одну основную услугу. Если нужны маникюр и педикюр — оформите две записи на два соседних времени.</p>
            </div>
          </div>

          <div className="compact-service-switch" role="radiogroup" aria-label="Основная услуга">
            {services.map((service) => (
              <button key={service.id} type="button" role="radio" aria-checked={selectedServiceId === service.id} className={selectedServiceId === service.id ? "active" : ""} onClick={() => setSelectedServiceId(service.id)}>
                <b>{service.title}</b><small>{service.durationMinutes} мин · {rub(service.price)}</small>
              </button>
            ))}
          </div>
          {services.length === 0 ? <div className="notice danger-notice">Нет услуг, доступных для записи.</div> : null}

          <form action={createBooking} className="booking-builder-form compact-booking-form">
            <input type="hidden" name="clientToken" value={token} />
            <input type="hidden" name="startAt" value={selectedWindow.startAt} />
            <input type="hidden" name="returnDate" value={selectedDateKey} />
            <input type="hidden" name="returnTime" value={selectedWindow.startAt} />
            <input type="hidden" name="serviceId" value={selectedService?.id || ""} />

            <div className="selected-summary-panel">
              <div><span>Дата и время</span><b>{fmtDate(selectedWindow.startAt)}, {fmtTime(selectedWindow.startAt)}</b></div>
              <div><span>Услуга</span><b>{selectedService?.title || "Выберите услугу"}</b>{selectedService ? <small>{selectedService.durationMinutes} мин · {rub(selectedService.price)}</small> : null}</div>
              <div><span>Клиент</span><b>{client.firstName} {client.lastName}</b><small>{client.phone}</small></div>
            </div>

            <p className="owner-warning">Проверьте, что запись оформляется именно на вас. Мастер ждёт человека из карточки, а не сюжетный поворот.</p>

            <div className="notice final-check-note">
              <b>После отправки заявки напишите мастеру.</b>
              <p>Сайт ещё тестовый: он старается быть полезным, но иногда ведёт себя как стажёр на первом рабочем дне. Мастер проверит время вручную и подтвердит, что всё встало нормально.</p>
            </div>

            <label className="comment-box">Комментарий, если нужно<textarea name="comment" placeholder="Например: хочу френч / ремонт ногтя / дизайн / есть ограничение по времени" /></label>

            <div className="final-confirm-card">
              <div>
                <h3>Отправка заявки</h3>
                <p>Сразу после отправки окно закрепится за вами и исчезнет у других клиентов. Запись при этом ещё должна быть подтверждена мастером.</p>
              </div>
              <button type="submit" disabled={!selectedService}>Подтвердить и отправить</button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
