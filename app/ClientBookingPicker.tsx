"use client";

import { useMemo, useState } from "react";
import { createBooking } from "@/app/actions";

type WindowItem = {
  id: string;
  startAt: string;
  busy: boolean;
};

type ServiceItem = {
  id: string;
  title: string;
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

function dayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

function fmtDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(date);
}

function fmtMonth(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
}

function fmtTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
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

export default function ClientBookingPicker({ token, client, windows, services, initialDate, initialTime = "" }: Props) {
  const freeDateKeys = useMemo(() => new Set(windows.filter((item) => !item.busy).map((item) => dayKey(item.startAt))), [windows]);
  const firstFreeDate = useMemo(() => Array.from(freeDateKeys).sort()[0] || initialDate || dayKey(new Date()), [freeDateKeys, initialDate]);
  const [selectedDateKey, setSelectedDateKey] = useState(initialDate || firstFreeDate);
  const [selectedTime, setSelectedTime] = useState(initialTime);

  const monthBase = useMemo(() => {
    const current = windows.find((item) => dayKey(item.startAt) === selectedDateKey)?.startAt;
    return current ? new Date(current) : new Date(`${selectedDateKey}T00:00:00`);
  }, [selectedDateKey, windows]);

  const monthDays = useMemo(() => Array.from({ length: daysInMonth(monthBase) }, (_, index) => index + 1), [monthBase]);
  const selectedWindows = useMemo(() => windows.filter((item) => dayKey(item.startAt) === selectedDateKey), [windows, selectedDateKey]);
  const selectedFreeCount = selectedWindows.filter((item) => !item.busy).length;
  const selectedBusyCount = selectedWindows.length - selectedFreeCount;
  const selectedWindow = selectedWindows.find((item) => item.startAt === selectedTime && !item.busy);

  function chooseDate(key: string) {
    setSelectedDateKey(key);
    const firstFreeTime = windows.find((item) => dayKey(item.startAt) === key && !item.busy)?.startAt || "";
    setSelectedTime(firstFreeTime);
  }

  return (
    <>
      <section className="calendar-layout" id="windows">
        <article className="calendar-card">
          <h2>Ближайшие свободные даты</h2>
          <div className="actions" style={{ justifyContent: "space-between", marginTop: 12 }}>
            <span className="button secondary" aria-disabled="true">‹</span>
            <b>{fmtMonth(monthBase)}</b>
            <span className="button secondary" aria-disabled="true">›</span>
          </div>
          <div className="calendar-head">{["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {Array.from({ length: monthOffset(monthBase) }).map((_, index) => <span className="day-btn muted" key={`empty-${index}`}></span>)}
            {monthDays.map((day) => {
              const date = new Date(monthBase.getFullYear(), monthBase.getMonth(), day);
              const key = dayKey(date);
              const hasFree = freeDateKeys.has(key);
              const active = key === selectedDateKey;
              return hasFree ? (
                <button key={key} type="button" className={active ? "day-btn active" : "day-btn"} onClick={() => chooseDate(key)}>
                  <span>{day}</span><i className="dot" />
                </button>
              ) : (
                <span key={key} className="day-btn muted" aria-disabled="true"><span>{day}</span></span>
              );
            })}
          </div>
        </article>

        <article className="selected-day-card card" id="selected-day">
          <p className="muted">Выбранная дата</p>
          <h2>{fmtDate(new Date(`${selectedDateKey}T00:00:00`))}</h2>
          <p>{selectedBusyCount} занято · {selectedFreeCount} свободно</p>
          <div className="time-grid">
            {selectedWindows.map((window) => {
              const active = selectedTime === window.startAt;
              return window.busy ? (
                <span key={window.id} className="time-btn busy" aria-disabled="true"><b>{fmtTime(window.startAt)}</b><span>Занято</span></span>
              ) : (
                <button key={window.id} type="button" className={active ? "time-btn free active" : "time-btn free"} onClick={() => setSelectedTime(window.startAt)}>
                  <b>{fmtTime(window.startAt)}</b><span>Свободно</span>
                </button>
              );
            })}
            {selectedWindows.length === 0 ? <div className="empty-state"><p>На эту дату открытых окон нет.</p></div> : null}
          </div>
        </article>
      </section>

      <section className="card booking-builder" id="booking-builder">
        <div className="section-head">
          <div>
            <p className="muted">Сборка записи</p>
            <h2>Дата, время, услуга и отправка</h2>
            <p>Здесь показываются только основные услуги. Френч, дизайн и другие допы остаются в прайсе.</p>
          </div>
          {selectedWindow ? <span className="status ok">{fmtDate(selectedWindow.startAt)}, {fmtTime(selectedWindow.startAt)}</span> : <span className="status">Время не выбрано</span>}
        </div>

        {selectedWindow ? (
          <form action={createBooking} className="booking-builder-form">
            <input type="hidden" name="clientToken" value={token} />
            <input type="hidden" name="startAt" value={selectedWindow.startAt} />
            <input type="hidden" name="returnDate" value={selectedDateKey} />
            <input type="hidden" name="returnTime" value={selectedWindow.startAt} />

            <div className="booking-summary-row">
              <div><span>Дата</span><b>{fmtDate(selectedWindow.startAt)}</b></div>
              <div><span>Время</span><b>{fmtTime(selectedWindow.startAt)}</b></div>
              <div><span>Клиент</span><b>{client.firstName} {client.lastName}</b></div>
              <div><span>Телефон</span><b>{client.phone}</b></div>
            </div>

            <div>
              <h3>Основная услуга</h3>
              <p className="muted">Выберите одну услугу для этого времени. Если нужна вторая процедура — выберите отдельное окно после этой записи.</p>
              <div className="service-check-grid">
                {services.map((service, index) => (
                  <label className="service-check" key={service.id}>
                    <input type="radio" name="serviceId" value={service.id} defaultChecked={index === 0} />
                    <span><b>{service.title}</b><small>{service.durationMinutes} мин · {rub(service.price)}</small></span>
                  </label>
                ))}
              </div>
              {services.length === 0 ? <div className="notice">Нет услуг, доступных для записи. Проверьте настройки прайса у мастера.</div> : null}
              <p className="muted">Допы вроде френча или дизайна можно посмотреть в прайсе и написать в комментарии.</p>
            </div>

            <label>Комментарий к записи<textarea name="comment" placeholder="Например: хочу френч / ремонт ногтя / дизайн / есть ограничение по времени" /></label>

            <div className="confirm-box">
              <h3>Проверка</h3>
              <p>После отправки окно закрепится за вами, а мастер увидит заявку. Статус появится ниже.</p>
              <button type="submit" disabled={services.length === 0}>Отправить заявку</button>
            </div>
          </form>
        ) : (
          <div className="empty-state"><h3>Выберите время справа</h3><p>После выбора времени здесь появится форма записи.</p></div>
        )}
      </section>
    </>
  );
}
