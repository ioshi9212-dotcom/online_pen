"use client";

import { createBooking } from "@/app/actions";
import {
  businessDateFromKey,
  businessDateKey,
  businessMonthKey,
  formatInBusinessTime,
  parseDateKey
} from "@/lib/timezone";
import { useEffect, useMemo, useRef, useState } from "react";

export type BookingWindow = {
  id: string;
  startAt: string;
  availableServiceIds: string[];
};

export type BookingServiceOption = {
  id: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  price: number;
  isBundle?: boolean;
};

type ClientInfo = {
  firstName: string;
  lastName: string;
  phone: string;
};

type Props = {
  client: ClientInfo;
  windows: BookingWindow[];
  services: BookingServiceOption[];
  initialDate?: string;
  previewMode?: boolean;
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

function fmtMonth(key: string) {
  return upperFirst(formatInBusinessTime(businessDateFromKey(`${key}-01`), { month: "long", year: "numeric" }));
}

function fmtTime(value: string | Date) {
  return formatInBusinessTime(value, { hour: "2-digit", minute: "2-digit" });
}

function rub(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(value);
}

function daysInMonth(key: string) {
  const { year, month } = parseDateKey(`${key}-01`);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthOffset(key: string) {
  const { year, month } = parseDateKey(`${key}-01`);
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

function addMonths(key: string, offset: number) {
  const { year, month } = parseDateKey(`${key}-01`);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function focusSection(element: HTMLElement | null) {
  if (!element) return;
  window.setTimeout(() => {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    element.focus({ preventScroll: true });
  }, 80);
}

export default function ClientBookingPicker({
  client,
  windows,
  services,
  initialDate = "",
  previewMode = false
}: Props) {
  const serviceRef = useRef<HTMLElement | null>(null);
  const calendarRef = useRef<HTMLElement | null>(null);
  const timeRef = useRef<HTMLElement | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [previewSubmitted, setPreviewSubmitted] = useState(false);

  const windowsByDate = useMemo(() => {
    const map = new Map<string, BookingWindow[]>();
    for (const item of windows) {
      const key = dayKey(item.startAt);
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [windows]);

  const selectedService = services.find((service) => service.id === selectedServiceId);
  const windowsForService = useMemo(
    () => selectedServiceId
      ? windows.filter((window) => window.availableServiceIds.includes(selectedServiceId))
      : [],
    [selectedServiceId, windows]
  );
  const freeDateKeys = useMemo(
    () => new Set(windowsForService.map((window) => dayKey(window.startAt))),
    [windowsForService]
  );
  const firstFreeDate = useMemo(
    () => Array.from(freeDateKeys).sort()[0] || "",
    [freeDateKeys]
  );
  const initialMonth = initialDate ? initialDate.slice(0, 7) : monthKey(new Date());
  const [visibleMonthKey, setVisibleMonthKey] = useState(initialMonth);
  const availableMonthKeys = useMemo(
    () => Array.from(new Set(windowsForService.map((window) => monthKey(window.startAt)))).sort(),
    [windowsForService]
  );
  const selectedDayWindows = selectedDateKey ? windowsByDate.get(selectedDateKey) || [] : [];
  const selectedAvailableWindows = selectedDayWindows.filter((window) => window.availableServiceIds.includes(selectedServiceId));
  const selectedWindow = selectedAvailableWindows.find((window) => window.startAt === selectedTime);
  const maxMonthKey = availableMonthKeys[availableMonthKeys.length - 1] || visibleMonthKey;
  const minMonthKey = availableMonthKeys[0] || visibleMonthKey;
  const monthDays = Array.from({ length: daysInMonth(visibleMonthKey) }, (_, index) => index + 1);

  useEffect(() => {
    if (selectedServiceId && !selectedDateKey) focusSection(calendarRef.current);
  }, [selectedServiceId, selectedDateKey]);

  useEffect(() => {
    if (selectedDateKey && !selectedTime) focusSection(timeRef.current);
  }, [selectedDateKey, selectedTime]);

  useEffect(() => {
    if (selectedTime) focusSection(reviewRef.current);
  }, [selectedTime]);

  function chooseService(id: string) {
    const optionWindows = windows.filter((window) => window.availableServiceIds.includes(id));
    const preferredDate = initialDate && optionWindows.some((window) => dayKey(window.startAt) === initialDate)
      ? initialDate
      : dayKey(optionWindows[0]?.startAt || new Date());
    setSelectedServiceId(id);
    setSelectedDateKey("");
    setSelectedTime("");
    setPreviewSubmitted(false);
    setVisibleMonthKey(preferredDate.slice(0, 7));
  }

  function chooseDate(key: string) {
    if (!freeDateKeys.has(key)) return;
    setSelectedDateKey(key);
    setSelectedTime("");
    setPreviewSubmitted(false);
  }

  function changeMonth(key: string) {
    if (key < minMonthKey || key > maxMonthKey) return;
    setVisibleMonthKey(key);
    setSelectedDateKey("");
    setSelectedTime("");
  }

  function changeService() {
    setSelectedServiceId("");
    setSelectedDateKey("");
    setSelectedTime("");
    setPreviewSubmitted(false);
    focusSection(serviceRef.current);
  }

  if (previewSubmitted && selectedService && selectedWindow) {
    return (
      <section className="client-v2-booking-success" id="booking-flow" role="status">
        <span className="client-v2-success-icon" aria-hidden="true">✓</span>
        <p className="client-v2-kicker">Заявка на запись отправлена</p>
        <h2>Время временно за вами</h2>
        <p>{fmtDate(selectedWindow.startAt)}, {fmtTime(selectedWindow.startAt)} · {selectedService.title}</p>
        <div className="client-v2-access-steps is-booking">
          <span className="is-done"><i>✓</i><b>Время выбрано</b></span>
          <span className="is-current"><i>2</i><b>Мастер проверяет</b></span>
          <span><i>3</i><b>Запись подтверждена</b></span>
        </div>
        <small>Это демонстрационный экран: настоящая заявка не отправлялась.</small>
        <button type="button" className="client-v2-button is-secondary" onClick={() => setPreviewSubmitted(false)}>Вернуться к выбору</button>
      </section>
    );
  }

  return (
    <section className="client-v2-flow" id="booking-flow">
      <nav className="client-v2-progress" aria-label="Этапы записи">
        <span className={selectedServiceId ? "is-done" : "is-current"}><i>{selectedServiceId ? "✓" : "1"}</i><b>Услуга</b></span>
        <span className={selectedDateKey ? "is-done" : selectedServiceId ? "is-current" : ""}><i>{selectedDateKey ? "✓" : "2"}</i><b>Дата</b></span>
        <span className={selectedTime ? "is-done" : selectedDateKey ? "is-current" : ""}><i>{selectedTime ? "✓" : "3"}</i><b>Время</b></span>
        <span className={selectedTime ? "is-current" : ""}><i>4</i><b>Готово</b></span>
      </nav>

      <section className="client-v2-step" ref={serviceRef} tabIndex={-1}>
        <div className="client-v2-step-heading">
          <span>Шаг 1</span>
          <div><h2>Что будем делать?</h2><p>От услуги зависит, какие даты и часы свободны.</p></div>
        </div>

        {services.length ? (
          <div className="client-v2-service-grid">
            {services.map((service) => (
              <button
                type="button"
                key={service.id}
                className={`client-v2-service ${selectedServiceId === service.id ? "is-selected" : ""}`}
                onClick={() => chooseService(service.id)}
                aria-pressed={selectedServiceId === service.id}
              >
                <span>
                  <b>{service.title}</b>
                  {service.isBundle ? <em>Одна длинная запись</em> : null}
                </span>
                {service.description ? <small>{service.description}</small> : null}
                <strong>{service.durationMinutes} мин · {rub(service.price)}</strong>
              </button>
            ))}
          </div>
        ) : (
          <div className="client-v2-empty">Сейчас нет услуг, открытых для онлайн-записи.</div>
        )}
      </section>

      {selectedService ? (
        <section className="client-v2-step" ref={calendarRef} tabIndex={-1}>
          <div className="client-v2-step-heading">
            <span>Шаг 2</span>
            <div>
              <h2>Выберите дату</h2>
              <p>Показываем только дни, где целиком помещается «{selectedService.title}».</p>
            </div>
            <button type="button" className="client-v2-text-button" onClick={changeService}>Изменить услугу</button>
          </div>

          {firstFreeDate ? (
            <div className="client-v2-calendar">
              <div className="client-v2-calendar-top">
                <button type="button" onClick={() => changeMonth(addMonths(visibleMonthKey, -1))} disabled={visibleMonthKey <= minMonthKey} aria-label="Предыдущий месяц">‹</button>
                <b>{fmtMonth(visibleMonthKey)}</b>
                <button type="button" onClick={() => changeMonth(addMonths(visibleMonthKey, 1))} disabled={visibleMonthKey >= maxMonthKey} aria-label="Следующий месяц">›</button>
              </div>
              <div className="client-v2-calendar-head">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="client-v2-calendar-grid">
                {Array.from({ length: monthOffset(visibleMonthKey) }, (_, index) => <span key={`blank-${index}`} />)}
                {monthDays.map((day) => {
                  const key = `${visibleMonthKey}-${String(day).padStart(2, "0")}`;
                  const available = freeDateKeys.has(key);
                  const active = selectedDateKey === key;
                  return available ? (
                    <button
                      type="button"
                      key={key}
                      className={active ? "is-selected" : ""}
                      onClick={() => chooseDate(key)}
                      aria-pressed={active}
                    >
                      <b>{day}</b><i />
                    </button>
                  ) : (
                    <span className="is-disabled" key={key}><b>{day}</b></span>
                  );
                })}
              </div>
              <p className="client-v2-calendar-note"><i /> Розовой точкой отмечены дни, где есть подходящее время.</p>
            </div>
          ) : (
            <div className="client-v2-empty">
              <b>Для этой услуги пока нет подходящих окон.</b>
              <span>Можно выбрать другую услугу или добавить себя в лист ожидания ниже.</span>
            </div>
          )}
        </section>
      ) : null}

      {selectedService && selectedDateKey ? (
        <section className="client-v2-step" ref={timeRef} tabIndex={-1}>
          <div className="client-v2-step-heading">
            <span>Шаг 3</span>
            <div><h2>Выберите время</h2><p>{fmtDate(businessDateFromKey(selectedDateKey))}</p></div>
            <button type="button" className="client-v2-text-button" onClick={() => { setSelectedDateKey(""); setSelectedTime(""); }}>Изменить дату</button>
          </div>
          <div className="client-v2-time-grid">
            {selectedDayWindows.map((window) => {
              const available = window.availableServiceIds.includes(selectedService.id);
              const active = selectedTime === window.startAt;
              return available ? (
                <button
                  type="button"
                  key={window.id}
                  className={active ? "is-selected" : ""}
                  onClick={() => { setSelectedTime(window.startAt); setPreviewSubmitted(false); }}
                  aria-pressed={active}
                >
                  <b>{fmtTime(window.startAt)}</b>
                  <span>{active ? "Выбрано" : "Свободно"}</span>
                </button>
              ) : (
                <span key={window.id}><b>{fmtTime(window.startAt)}</b><small>Не подходит</small></span>
              );
            })}
          </div>
        </section>
      ) : null}

      {selectedService && selectedWindow ? (
        <section className="client-v2-step client-v2-review" ref={reviewRef} tabIndex={-1}>
          <div className="client-v2-step-heading">
            <span>Шаг 4</span>
            <div><h2>Всё верно?</h2><p>Проверьте заявку перед отправкой.</p></div>
          </div>

          <div className="client-v2-summary">
            <div><span>Услуга</span><b>{selectedService.title}</b><small>{selectedService.durationMinutes} мин · {rub(selectedService.price)}</small></div>
            <div><span>Дата и время</span><b>{fmtDate(selectedWindow.startAt)}</b><small>{fmtTime(selectedWindow.startAt)}</small></div>
            <div><span>Клиент</span><b>{client.firstName} {client.lastName}</b><small>{client.phone}</small></div>
          </div>

          {previewMode ? (
            <div className="client-v2-final-form">
              <label>Комментарий, если нужно<textarea placeholder="Например: френч, ремонт ногтя или ограничение по времени" /></label>
              <div className="client-v2-submit-row">
                <p><b>После отправки мастер проверит заявку.</b><span>До ответа время будет временно занято за вами.</span></p>
                <button type="button" onClick={() => setPreviewSubmitted(true)}>Отправить заявку</button>
              </div>
            </div>
          ) : (
            <form action={createBooking} className="client-v2-final-form">
              <input type="hidden" name="startAt" value={selectedWindow.startAt} />
              <input type="hidden" name="returnDate" value={selectedDateKey} />
              <input type="hidden" name="returnTime" value={selectedWindow.startAt} />
              <input type="hidden" name="serviceId" value={selectedService.id} />
              <label>Комментарий, если нужно<textarea name="comment" placeholder="Например: френч, ремонт ногтя или ограничение по времени" /></label>
              <div className="client-v2-submit-row">
                <p><b>После отправки мастер проверит заявку.</b><span>До ответа время будет временно занято за вами.</span></p>
                <button type="submit">Отправить заявку</button>
              </div>
            </form>
          )}
        </section>
      ) : null}
    </section>
  );
}
