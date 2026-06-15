import { isAdmin } from "@/lib/admin";
import { formatDateTime, rub } from "@/lib/format";
import { BOOKING_STATUS_OPTIONS, CLIENT_STATUS_OPTIONS, bookingStatusLabel, clientStatusLabel, statusClass } from "@/lib/statusLabels";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { cancelManualBooking, createManualBooking, createManualClient, updateManualBooking, updateManualClient } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toDateTimeInput(date: Date) {
  return date.toISOString().slice(0, 16);
}

function Notice({ searchParams }: { searchParams: SearchParams }) {
  const client = one(searchParams, "client");
  const booking = one(searchParams, "booking");
  const bookingError = one(searchParams, "bookingError");

  if (bookingError) return <div className="notice danger-notice">Запись не сохранена: {bookingError}.</div>;
  if (client === "created") return <div className="notice ok-notice">Клиент добавлен в базу.</div>;
  if (client === "merged") return <div className="notice ok-notice">Клиент объединён по номеру телефона. Записи и ждуны остались в общей карточке.</div>;
  if (client === "saved") return <div className="notice ok-notice">Клиент сохранён.</div>;
  if (booking === "created") return <div className="notice ok-notice">Запись создана.</div>;
  if (booking === "saved") return <div className="notice ok-notice">Запись сохранена.</div>;
  if (booking === "cancelled") return <div className="notice">Запись отменена.</div>;

  return null;
}

export default async function ManualAdminPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  if (!isAdmin()) redirect("/admin/login");

  const [clients, bookableClients, services, bookings] = await Promise.all([
    prisma.client.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    prisma.client.findMany({ where: { status: "APPROVED" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.service.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { title: "asc" }] }),
    prisma.booking.findMany({ include: { client: true, service: true }, orderBy: { startAt: "desc" }, take: 80 })
  ]);

  return (
    <div className="grid">
      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h1>Ручное управление</h1>
            <p>Добавление и редактирование клиентов, ручная запись, изменение записи и отмена.</p>
          </div>
          <div className="actions">
            <a className="button secondary" href="/admin">Админка</a>
            <a className="button secondary" href="/admin/logout">Выйти</a>
          </div>
        </div>
      </section>

      <Notice searchParams={searchParams} />

      <section className="card">
        <h2>Добавить клиента</h2>
        <p className="small">Если номер уже есть в базе, сайт не создаст дубль — обновит общую карточку по телефону.</p>
        <form action={createManualClient} className="grid">
          <div className="grid-3">
            <label>Имя<input name="firstName" required /></label>
            <label>Фамилия<input name="lastName" required /></label>
            <label>Телефон<input name="phone" required placeholder="89940199045" /></label>
          </div>
          <div className="grid-3">
            <label>Дата рождения<input name="birthDate" type="date" required /></label>
            <label>Статус
              <select name="status" defaultValue="APPROVED">
                {CLIENT_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
            <label>Заметка<input name="notes" placeholder="например: френч, аллергия, предоплата" /></label>
          </div>
          <button>Добавить / обновить клиента</button>
        </form>
      </section>

      <section className="card">
        <h2>Записать клиента вручную</h2>
        {bookableClients.length === 0 || services.length === 0 ? <div className="notice">Нужен хотя бы один подтверждённый клиент и одна услуга.</div> : (
          <form action={createManualBooking} className="grid">
            <div className="grid-3">
              <label>Клиент<select name="clientId">{bookableClients.map((c) => <option key={c.id} value={c.id}>{c.lastName} {c.firstName} — {c.phone}</option>)}</select></label>
              <label>Услуга<select name="serviceId">{services.map((s) => <option key={s.id} value={s.id}>{s.title} — {s.durationMinutes} мин — {rub(s.price)}</option>)}</select></label>
              <label>Дата и время<input name="startAt" type="datetime-local" required /></label>
            </div>
            <div className="grid-3">
              <label>Статус
                <select name="status" defaultValue="CONFIRMED">
                  {BOOKING_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
              <label>Итоговая цена<input name="finalPrice" type="number" min="0" /></label>
              <label>Комментарий клиента<input name="clientComment" /></label>
            </div>
            <label>Твоя заметка<textarea name="adminComment" /></label>
            <button>Создать запись</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Клиенты</h2>
        <div className="notice">Сохранение по номеру объединяет карточки, если такой телефон уже есть у другого клиента.</div>
        <table className="table">
          <thead><tr><th>Данные</th><th>Статус</th><th>Заметки</th><th></th></tr></thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td>
                  <form id={`client-${client.id}`} action={updateManualClient} className="grid">
                    <input type="hidden" name="id" value={client.id} />
                    <input name="lastName" defaultValue={client.lastName} required />
                    <input name="firstName" defaultValue={client.firstName} required />
                    <input name="phone" defaultValue={client.phone} required />
                    <input name="birthDate" type="date" defaultValue={toDateInput(client.birthDate)} required />
                  </form>
                </td>
                <td>
                  <div className="grid">
                    <select name="status" form={`client-${client.id}`} defaultValue={client.status}>
                      {CLIENT_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                    <span className={`status ${statusClass(client.status)}`}>{clientStatusLabel(client.status)}</span>
                  </div>
                </td>
                <td><textarea name="notes" form={`client-${client.id}`} defaultValue={client.notes} /></td>
                <td><button form={`client-${client.id}`} className="ok">Сохранить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Записи</h2>
        <table className="table">
          <thead><tr><th>Дата/клиент</th><th>Услуга/статус</th><th>Цена/комментарии</th><th></th></tr></thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td>
                  <form id={`booking-${booking.id}`} action={updateManualBooking} className="grid">
                    <input type="hidden" name="id" value={booking.id} />
                    <input name="startAt" type="datetime-local" defaultValue={toDateTimeInput(booking.startAt)} required />
                    <select name="clientId" defaultValue={booking.clientId}>{bookableClients.map((c) => <option key={c.id} value={c.id}>{c.lastName} {c.firstName} — {c.phone}</option>)}</select>
                    <span className="small">Сейчас: {formatDateTime(booking.startAt)}</span>
                  </form>
                </td>
                <td>
                  <div className="grid">
                    <select name="serviceId" form={`booking-${booking.id}`} defaultValue={booking.serviceId}>{services.map((s) => <option key={s.id} value={s.id}>{s.title} — {s.durationMinutes} мин</option>)}</select>
                    <select name="status" form={`booking-${booking.id}`} defaultValue={booking.status}>{BOOKING_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
                    <span className={`status ${statusClass(booking.status)}`}>{bookingStatusLabel(booking.status)}</span>
                  </div>
                </td>
                <td><div className="grid"><input name="finalPrice" form={`booking-${booking.id}`} type="number" min="0" defaultValue={booking.finalPrice ?? ""} placeholder={String(booking.service.price)} /><input name="clientComment" form={`booking-${booking.id}`} defaultValue={booking.clientComment} /><textarea name="adminComment" form={`booking-${booking.id}`} defaultValue={booking.adminComment} /></div></td>
                <td className="actions"><button form={`booking-${booking.id}`} className="ok">Сохранить</button><form action={cancelManualBooking}><input type="hidden" name="id" value={booking.id} /><button className="danger">Отменить</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
