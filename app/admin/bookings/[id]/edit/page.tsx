import { isAdmin } from "@/lib/admin";
import { bookingDisplayComment, bookingDisplayTitle } from "@/lib/bookingDisplay";
import { DURATION_OPTIONS, durationLabel } from "@/lib/durations";
import { formatDateTime, rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { BOOKING_STATUS_OPTIONS, bookingStatusLabel, clientStatusLabel, statusClass } from "@/lib/statusLabels";
import { businessDateKey, formatInBusinessTime } from "@/lib/timezone";
import { redirect } from "next/navigation";
import { updateBooking } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(searchParams: SearchParams | undefined, key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function toTimeInputValue(date: Date) {
  return formatInBusinessTime(date, { hour: "2-digit", minute: "2-digit" });
}

function statusHint(status: string) {
  if (status === "PENDING") return "Заявка ждёт подтверждения мастера и занимает окно.";
  if (status === "CONFIRMED") return "Подтверждённая запись занимает окно.";
  if (status === "COMPLETED") return "Запись завершена. Окно больше не считается занятым будущей записью.";
  if (status === "NO_SHOW") return "Клиент не пришёл. Окно больше не считается активным.";
  if (status === "CANCELLED_BY_CLIENT") return "Отмена клиентом. Окно можно занять другой записью.";
  if (status === "CANCELLED_BY_ADMIN") return "Отмена мастером. Окно можно занять другой записью.";
  if (status === "REJECTED") return "Заявка отклонена. Окно освобождается.";
  return "";
}

export default async function EditBookingPage({ params, searchParams }: { params: { id: string }; searchParams?: SearchParams }) {
  if (!isAdmin()) redirect("/admin/login");

  const [booking, clients, services] = await Promise.all([
    prisma.booking.findUnique({ where: { id: params.id }, include: { client: true, service: true } }),
    prisma.client.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })
  ]);

  if (!booking) redirect("/admin/bookings");

  const error = one(searchParams, "error");
  const saved = one(searchParams, "saved");
  const durationMinutes = Math.max(15, Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60_000) || booking.service.durationMinutes || 150);
  const bookingDateKey = businessDateKey(booking.startAt);

  return (
    <div className="grid">
      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <p className="eyebrow">Редактирование записи</p>
            <h1>{booking.client.lastName} {booking.client.firstName}</h1>
            <p>{formatDateTime(booking.startAt)} · {bookingDisplayTitle(booking.service.title, booking.clientComment)} · <span className={`status ${statusClass(booking.status)}`}>{bookingStatusLabel(booking.status)}</span></p>
          </div>
          <div className="actions">
            <a className="button secondary" href="/admin">Главная</a>
            <a className="button secondary" href="/admin/bookings">Все записи</a>
            <a className="button secondary" href={`/admin/my-clients/${booking.clientId}`}>Профиль клиента</a>
          </div>
        </div>
      </section>

      {saved ? <div className="notice ok-notice floating-toast">Запись сохранена.</div> : null}
      {error ? <div className="notice danger-notice floating-toast">Запись не сохранена: {error}</div> : null}

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Перенести / изменить запись</h2>
            <p>Меняй дату, время, услугу, клиента, статус и комментарии. Если новое время конфликтует с другой активной записью или закрытым окном — система не даст сохранить.</p>
          </div>
        </div>

        <form action={updateBooking} className="grid booking-edit-form">
          <input type="hidden" name="id" value={booking.id} />

          <div className="grid-3">
            <label>Клиент
              <select name="clientId" defaultValue={booking.clientId} required>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.lastName} {client.firstName} — {client.phone} · {clientStatusLabel(client.status)}</option>)}
              </select>
            </label>

            <label>Услуга
              <select name="serviceId" defaultValue={booking.serviceId} required>
                {services.map((service) => <option key={service.id} value={service.id}>{service.title} — {durationLabel(service.durationMinutes)} — {rub(service.price)}{service.isActive ? "" : " · выключена"}</option>)}
              </select>
            </label>

            <label>Дата
              <input name="startDate" type="date" defaultValue={bookingDateKey} required />
            </label>
          </div>

          <div className="grid-3">
            <label>Время
              <input name="startTime" type="time" defaultValue={toTimeInputValue(booking.startAt)} required />
            </label>

            <label>Длительность
              <select name="durationMinutes" defaultValue={String(durationMinutes)}>
                {DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label>Статус
              <select name="status" defaultValue={booking.status}>
                {BOOKING_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid-3">
            <label>Итоговая цена
              <input name="finalPrice" type="number" min="0" defaultValue={booking.finalPrice ?? ""} placeholder={String(booking.service.price)} />
            </label>
          </div>

          <div className="notice">
            <b>Статусы без сюрпризов:</b> {statusHint(booking.status)} Активными считаются только “ожидает подтверждения” и “подтверждена”. Остальные освобождают окно.
          </div>

          <label>Комментарий клиента
            <input name="clientComment" defaultValue={bookingDisplayComment(booking.clientComment)} placeholder="что просила клиентка" />
          </label>

          <label>Заметка мастера
            <textarea name="adminComment" defaultValue={booking.adminComment} placeholder="дизайн, нюансы, предоплата, что не забыть" />
          </label>

          <div className="actions">
            <button type="submit">Сохранить изменения</button>
            <a className="button secondary" href="/admin">Назад на главную</a>
            <a className="button secondary" href={`/admin/schedule?view=calendar&month=${businessDateKey(booking.startAt).slice(0, 7)}&date=${businessDateKey(booking.startAt)}#selected-day`}>Открыть день</a>
          </div>
        </form>
      </section>
    </div>
  );
}
