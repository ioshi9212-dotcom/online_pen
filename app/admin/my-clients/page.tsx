import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { CLIENT_STATUS_OPTIONS, clientStatusLabel, statusClass } from "@/lib/statusLabels";
import { redirect } from "next/navigation";
import { archiveClient, createMyClient, saveMyClient } from "./actions";

export const dynamic = "force-dynamic";

const activeStatuses = ["PENDING", "APPROVED", "BANNED"];

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
  if (saved === "created") return <div className="notice ok-notice floating-toast">Клиент добавлен. Форма очищена.</div>;
  if (saved === "saved") return <div className="notice ok-notice floating-toast">Клиент сохранён.</div>;
  if (saved === "archived") return <div className="notice floating-toast">Клиент отправлен в архив.</div>;
  return null;
}

function AddClientForm() {
  return (
    <section className="card" id="add-client">
      <div className="section-head">
        <div>
          <p className="eyebrow">Быстрое добавление</p>
          <h2>Добавить клиента</h2>
          <p>После сохранения страница обновится, а поля снова будут пустыми. Если телефон уже есть — карточки объединятся.</p>
        </div>
      </div>
      <form action={createMyClient} className="grid">
        <div className="grid-3">
          <label>Фамилия<input name="lastName" required placeholder="Иванова" /></label>
          <label>Имя<input name="firstName" required placeholder="Мария" /></label>
          <label>Телефон<input name="phone" required placeholder="89940199045" /></label>
        </div>
        <div className="grid-3">
          <label>Дата рождения<input name="birthDate" type="date" required /></label>
          <label>Статус
            <select name="status" defaultValue="APPROVED">
              {CLIENT_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
          <label>Заметка<input name="notes" placeholder="например: френч, аллергия, любит нюд" /></label>
        </div>
        <div className="actions">
          <button type="submit">Добавить клиента</button>
          <a className="button secondary" href="/admin">Админка</a>
        </div>
      </form>
    </section>
  );
}

export default async function MyClientsPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  if (!isAdmin()) redirect("/admin/login");

  const clients = await prisma.client.findMany({
    where: { status: { in: activeStatuses as any } },
    include: {
      bookings: {
        where: { status: { in: ["PENDING", "CONFIRMED"] as any } },
        orderBy: { startAt: "asc" },
        take: 1,
        include: { service: true }
      }
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  return (
    <div className="grid">
      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h1>Мои клиенты</h1>
            <p>Сначала добавление, ниже — список клиентов. Из карточки можно открыть профиль, быстро записать или отправить в архив.</p>
          </div>
          <div className="actions">
            <a className="button secondary" href="/admin/manage">Ручная запись</a>
            <a className="button secondary" href="/admin/archive">Архив</a>
            <a className="button secondary" href="/admin">Админка</a>
            <a className="button secondary" href="/admin/logout">Выйти</a>
          </div>
        </div>
      </section>

      <Notice searchParams={searchParams} />
      <AddClientForm />

      <section className="card" id="clients-list">
        <div className="section-head">
          <div>
            <p className="eyebrow">Список</p>
            <h2>Клиенты</h2>
            <p>Открывай профиль для полного редактирования. Быстрая форма здесь — только для мелких правок.</p>
          </div>
          <span className="status wait">{clients.length} в базе</span>
        </div>

        {clients.length === 0 ? <div className="notice">Клиентов пока нет. Форма выше ждёт первого героя.</div> : null}

        <div className="client-card-list">
          {clients.map((client) => {
            const nextBooking = client.bookings[0];
            return (
              <article className="client-list-card" key={client.id}>
                <div className="client-card-main">
                  <div className="avatar-preview small-avatar">{client.avatarUrl ? <img src={client.avatarUrl} alt="Фото клиента" /> : <span>{client.firstName.slice(0, 1).toUpperCase()}</span>}</div>
                  <div>
                    <h3>{client.lastName} {client.firstName}</h3>
                    <p>{client.phone}</p>
                    <span className={`status ${statusClass(client.status)}`}>{clientStatusLabel(client.status)}</span>
                    {nextBooking ? <small>Ближайшая запись: {nextBooking.startAt.toLocaleDateString("ru-RU")} · {nextBooking.service.title}</small> : <small>Активных записей нет</small>}
                  </div>
                </div>

                <div className="client-card-actions">
                  <a className="button" href={`/admin/my-clients/${client.id}`}>Открыть профиль</a>
                  <a className="button secondary" href={`/admin/manage?clientId=${client.id}#manual-booking`}>Записать клиентку</a>
                  <details className="soft-details compact-details">
                    <summary className="button secondary">Быстро править</summary>
                    <form id={`client-${client.id}`} action={saveMyClient} className="grid inline-edit-card">
                      <input type="hidden" name="id" value={client.id} />
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
                      <button className="ok">Сохранить</button>
                    </form>
                  </details>
                  <details className="soft-details compact-details archive-details">
                    <summary className="button danger">В архив</summary>
                    <form action={archiveClient} className="grid">
                      <input type="hidden" name="id" value={client.id} />
                      <input name="archiveReason" placeholder="причина архива" />
                      <button className="danger">Подтвердить архив</button>
                    </form>
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
