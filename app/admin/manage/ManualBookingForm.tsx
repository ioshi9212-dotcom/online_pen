"use client";

import { useActionState, useMemo, useState } from "react";
import { updateBooking } from "../bookings/[id]/edit/actions";
import { createManualBooking } from "./actions";
import { DURATION_OPTIONS } from "@/lib/durations";
import { BOOKING_STATUS_OPTIONS } from "@/lib/statusLabels";
import SubmitButton from "@/app/SubmitButton";

type Service = { id: string; title: string; durationMinutes: number; price: number };
type Booking = { id: string; serviceId: string; durationMinutes: number; finalPrice: number | null; status: string; clientComment: string; adminComment: string };
type Props = { clients: { id: string; name: string; phone: string }[]; services: Service[]; initialClientId: string; initialStart: string; booking?: Booking };
export default function ManualBookingForm({ clients, services, initialClientId, initialStart, booking }: Props) {
  const [state, action] = useActionState(booking ? updateBooking : createManualBooking, { error: "" });
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState(initialClientId);
  const initialService = services.find((item) => item.id === booking?.serviceId) || services[0];
  const [serviceId, setServiceId] = useState(initialService?.id || "");
  const [duration, setDuration] = useState(booking?.durationMinutes || initialService?.durationMinutes || 120);
  const [price, setPrice] = useState(String(booking?.finalPrice ?? initialService?.price ?? ""));
  const [start, setStart] = useState(initialStart);
  const [status, setStatus] = useState(booking?.status || "CONFIRMED");
  const [comment, setComment] = useState(booking?.clientComment || "");
  const [note, setNote] = useState(booking?.adminComment || "");
  const filtered = useMemo(() => clients.filter((item) => item.id === clientId || `${item.name} ${item.phone}`.toLowerCase().includes(query.toLowerCase())), [clients, query, clientId]);
  function selectService(id: string) { const service = services.find((item) => item.id === id); setServiceId(id); if (service) { setDuration(service.durationMinutes); setPrice(String(service.price)); } }
  return <form action={action} className="grid manual-booking-form">
    {booking ? <input type="hidden" name="id" value={booking.id} /> : null}
    <label>Найти клиента<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя, фамилия или телефон" /></label>
    <div className="grid-3"><label>Клиент<select name="clientId" required value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Выберите клиента</option>{filtered.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.phone}</option>)}</select></label>
    <label>Услуга<select name="serviceId" required value={serviceId} onChange={(e) => selectService(e.target.value)}>{services.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.price} ₽</option>)}</select></label>
    <label>Дата и время<input name="startAt" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} /></label></div>
    <div className="grid-3"><label>Длительность<select name="durationMinutes" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{!DURATION_OPTIONS.some((item) => item.value === duration) ? <option value={duration}>{duration} мин</option> : null}{DURATION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label>Статус<select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>{BOOKING_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label>Итоговая цена<input name="finalPrice" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} /><small>Длительность и цена подставляются из услуги; их можно изменить.</small></label></div>
    <label>Комментарий клиента<input name="clientComment" value={comment} onChange={(e) => setComment(e.target.value)} /></label>
    <label>Заметка мастера<textarea name="adminComment" value={note} onChange={(e) => setNote(e.target.value)} /></label>
    {state.error ? <p className="notice danger-notice" role="alert">Запись не сохранена: {state.error}</p> : null}
    <SubmitButton>{booking ? "Сохранить изменения" : "Создать запись"}</SubmitButton>
  </form>;
}
