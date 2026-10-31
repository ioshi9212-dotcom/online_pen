import ClientEditor from "./ClientEditor";
import { isAdmin } from "@/lib/admin";
import { formatDateTime, rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { BOOKING_STATUS_OPTIONS, CLIENT_STATUS_OPTIONS, bookingStatusLabel, clientStatusLabel, statusClass } from "@/lib/statusLabels";
import { redirect } from "next/navigation";
import { archiveClient } from "../actions";

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

export default async function AdminClientProfilePage({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ id: string }>; searchParams?: Promise<SearchParams> }) {
  const params = await paramsPromise;
  const searchParams = (await searchParamsPromise) || {};

  if (!(await isAdmin())) redirect("/admin/login");

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
        <ClientEditor client={{ id: client.id, firstName: client.firstName, lastName: client.lastName, phone: client.phone, birthDate: toDateInput(client.birthDate), status: client.status, notes: client.notes }} />
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Записи</h2>
            <p>Последние записи клиента. Теперь каждую запись можно открыть и перенести нормально, без ручного пересоздания.</p>
          </div>
          <a className="button secondary" href="/admin/bookings">Открыть все записи</a>
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
              <a className="button secondary" href={`/admin/bookings/${booking.id}/edit`}>Изменить запись</a>
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
