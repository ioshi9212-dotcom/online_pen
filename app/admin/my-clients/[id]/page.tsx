import { isAdmin } from "@/lib/admin";
import { formatDateTime, rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { BOOKING_STATUS_OPTIONS, CLIENT_STATUS_OPTIONS, bookingStatusLabel, clientStatusLabel, statusClass } from "@/lib/statusLabels";
import { redirect } from "next/navigation";
import { archiveClient, saveMyClient } from "../actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function Notice({ searchParams }: { searchParams: SearchParams }) {
  const saved = one(searchParams, "saved");
  if (saved === "merged") return <div className="notice ok-notice floating-toast">Карточки объединены по телефону.</div>;
  if (saved === "saved") return <div className="notice ok-notice floating-toast">Профиль клиента сохранён.</div>;
  return null;
}

export default async function AdminClientProfilePage({ params, searchParams = {} }: { params: { id: string }; searchParams?: SearchParams }) {
  if (!isAdmin()) redirect("/admin/login");

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      bookings: { include: { service: true }, orderBy: { startAt: "desc" }, take: 30 },
      waitlist: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } }
    }
  });

  if (!client) redirect("/admin/my-clients");

  return (
    <div className="grid">
      <section className="card profile-hero">
        <div className="avatar-preview">
          {client.avatarUrl ? <img src={client.avatarUrl} alt="Фото клиента" /> : <span>{client.firstName.slice(0, 1).toUpperCase()}</span>}
        </div>
        <div>
          <p className="eyebrow">Профиль клиента</p>
          <h1>{client.lastName} {client.firstName}</h1>
          <p>{client.phone} · <span className={`status ${statusClass(client.status)}`}>{clientStatusLabel(client.status)}</span></p>
        </div>
        <div className="actions profile-actions">
          <a className="button" href={`/admin/manage?clientId=${client.id}#manual-booking`}>Записать клиентку</a>
          <a className="button secondary" href="/admin/my-clients">Назад к клиентам</a>
          <a className="button secondary" href="/admin">Админка</a>
        </div>
      </section>

      <Notice searchParams={searchParams} />

      <section className="card">
        <h2>Данные клиента</h2>
        <form action={saveMyClient} className="grid">
          <input type="hidden" name="id" value={client.id} />
          <input type="hidden" name="redirectTo" value="profile" />
          <div className="grid-2">
            <label>Фамилия<input name="lastName" defaultValue={client.lastName} required /></label>
            <label>Имя<input name="firstName" defaultValue={client.firstName} required /></label>
          </div>
          <div className="grid-2">
            <label>Телефон<input name="phone" defaultValue={client.phone} required /></label>
            <label>Дата рождения<input name="birthDate" type="date" defaultValue={toDateInput(client.birthDate)} required /></label>
          </div>
          <label>Статус<select name="status" defaultValue={client.status}>{CLIENT_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          <label>Заметки<textarea name="notes" defaultValue={client.notes} /></label>
          <div className="actions">
            <button className="ok">Сохранить профиль</button>
            <a className="button secondary" href={`/admin/manage?clientId=${client.id}#manual-booking`}>Записать клиентку</a>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Записи</h2>
            <p>Последние записи клиента. Полное редактирование записи — в ручном управлении.</p>
          </div>
          <a className="button secondary" href={`/admin/manage?clientId=${client.id}#bookings-list`}>Открыть все записи</a>
        </div>
        {client.bookings.length === 0 ? <div className="notice">Записей пока нет.</div> : null}
        <div className="mini-list">
          {client.bookings.map((booking) => (
            <div className={booking.status === "PENDING" ? "mini-item pending-item" : "mini-item"} key={booking.id}>
              <b>{formatDateTime(booking.startAt)}</b>
              <span>{booking.service.title} · {rub(booking.finalPrice ?? booking.service.price)}</span>
              <span className={`status ${statusClass(booking.status)}`}>{bookingStatusLabel(booking.status)}</span>
              {booking.clientComment ? <small>Клиент: {booking.clientComment}</small> : null}
              {booking.adminComment ? <small>Заметка: {booking.adminComment}</small> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Лист ожидания</h2>
            <p>Активные пожелания клиента по свободным окнам.</p>
          </div>
          <span className="status wait">{client.waitlist.length}</span>
        </div>
        {client.waitlist.length === 0 ? <div className="notice">В листе ожидания клиента нет.</div> : null}
        <div className="mini-list">
          {client.waitlist.map((entry) => <div className="mini-item" key={entry.id}><b>{entry.mode === "DATES" ? "Конкретные даты" : "Ближайшее окно"}</b><span>{entry.note || "без комментария"}</span><small>Добавлено: {entry.createdAt.toLocaleDateString("ru-RU")}</small></div>)}
        </div>
      </section>

      <section className="card danger-zone">
        <h2>Архив</h2>
        <p>Если клиент больше не актуален, его можно убрать из активного списка. Записи и заметки останутся в базе.</p>
        <details className="soft-details compact-details archive-details">
          <summary className="button danger">Отправить клиента в архив</summary>
          <form action={archiveClient} className="grid">
            <input type="hidden" name="id" value={client.id} />
            <input name="archiveReason" placeholder="причина архива" />
            <button className="danger">Подтвердить архив</button>
          </form>
        </details>
      </section>
    </div>
  );
}
