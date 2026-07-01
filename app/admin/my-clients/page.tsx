import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { CLIENT_STATUS_OPTIONS, clientStatusLabel, statusClass } from "@/lib/statusLabels";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { archiveClient, createMyClient, saveMyClient } from "./actions";
import styles from "./my-clients.module.css";

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
    <details className="card client-add-details" id="add-client">
      <summary className="client-details-summary">
        <span>
          <small>Быстрое добавление</small>
          <b>Добавить клиента</b>
        </span>
        <i aria-hidden="true">⌄</i>
      </summary>
      <form action={createMyClient} className="grid compact-client-form">
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
        <div className="actions compact-form-actions">
          <button type="submit">Добавить клиента</button>
        </div>
      </form>
    </details>
  );
}

function searchFilter(query: string): Prisma.ClientWhereInput {
  const terms = query.split(/\s+/).map((term) => term.trim()).filter(Boolean);
  if (terms.length === 0) return {};

  return {
    AND: terms.map((term) => ({
      OR: [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { phone: { contains: term } }
      ]
    }))
  };
}

export default async function MyClientsPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  if (!isAdmin()) redirect("/admin/login");

  const query = (one(searchParams, "q") || "").trim();
  const clients = await prisma.client.findMany({
    where: {
      status: { in: activeStatuses as any },
      ...searchFilter(query)
    },
    include: {
      bookings: {
        where: { status: { in: ["PENDING", "CONFIRMED"] as any } },
        orderBy: { startAt: "asc" },
        take: 1,
        include: { service: true }
      }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  return (
    <div className={`grid ${styles.clientsPageClean}`}>
      <section className="card clients-hero">
        <h1>Мои клиенты</h1>
        <p>Здесь база клиентов: поиск, список и профиль клиента. Добавление свернуто ниже, чтобы не занимало экран.</p>
      </section>

      <Notice searchParams={searchParams} />
      <AddClientForm />

      <section className="card clients-list-card-wrap" id="clients-list">
        <div className="clients-list-head">
          <div>
            <p className="eyebrow">Список клиентов</p>
            <h2>Клиенты</h2>
            <p>Найди клиента по фамилии, имени или телефону. Профиль открывается отдельно для полного редактирования.</p>
          </div>
          <span className="status wait clients-list-count">{clients.length} в базе</span>
        </div>

        <form action="/admin/my-clients#clients-list" className="client-search-form">
          <input name="q" defaultValue={query} placeholder="Поиск по имени, фамилии или телефону" />
          <button type="submit">Найти</button>
          {query ? <a className="button secondary" href="/admin/my-clients#clients-list">Сбросить</a> : null}
        </form>

        <details className="clients-list-details" open={Boolean(query)}>
          <summary className="client-details-summary">
            <span>
              <small>{query ? `Найдено: ${clients.length}` : `${clients.length} клиентов`}</small>
              <b>{query ? "Результаты поиска" : "Показать список"}</b>
            </span>
            <i aria-hidden="true">⌄</i>
          </summary>

          {clients.length === 0 ? <div className="notice">Клиентов не нашла. Попробуй другой запрос или добавь клиента выше.</div> : null}

          <div className="client-card-list compact-client-list">
            {clients.map((client) => {
              const nextBooking = client.bookings[0];
              return (
                <article className="client-list-card compact-client-row" key={client.id}>
                  <div className="client-card-main compact-client-main">
                    <div className="avatar-preview small-avatar">{client.avatarUrl ? <img src={client.avatarUrl} alt="Фото клиента" /> : <span>{client.firstName.slice(0, 1).toUpperCase()}</span>}</div>
                    <div className="compact-client-text">
                      <div className="compact-client-title">
                        <h3>{client.lastName} {client.firstName}</h3>
                        <span className={`status ${statusClass(client.status)}`}>{clientStatusLabel(client.status)}</span>
                      </div>
                      <div className="compact-client-meta">
                        <p>{client.phone}</p>
                        {nextBooking ? <small>Запись: {nextBooking.startAt.toLocaleDateString("ru-RU")} · {nextBooking.service.title}</small> : <small>Активных записей нет</small>}
                      </div>
                    </div>
                  </div>

                  <div className="client-card-actions compact-client-actions">
                    <a className="button" href={`/admin/my-clients/${client.id}`}>Профиль</a>
                    <a className="button secondary" href={`/admin/manage?clientId=${client.id}#manual-booking`}>Записать</a>
                    <details className="soft-details compact-details">
                      <summary className="button secondary">Править</summary>
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
                      <summary className="button danger">Архив</summary>
                      <form action={archiveClient} className="grid">
                        <input type="hidden" name="id" value={client.id} />
                        <input name="archiveReason" placeholder="причина архива" />
                        <button className="danger">Подтвердить</button>
                      </form>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      </section>
    </div>
  );
}
