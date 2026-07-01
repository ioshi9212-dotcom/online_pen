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

function searchFilter(query: string) {
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
    <div className="grid clients-page-clean">
      <style jsx global>{`
        .clients-page-clean { gap: 12px !important; padding-bottom: 96px !important; }
        .clients-page-clean .card { border-radius: 18px !important; }
        .clients-hero { padding: 20px !important; }
        .clients-hero h1 { margin: 0 !important; font-size: clamp(30px, 7vw, 44px) !important; line-height: 1 !important; }
        .clients-hero p { max-width: 520px !important; margin: 10px 0 0 !important; font-size: 15px !important; line-height: 1.35 !important; }

        .client-add-details { padding: 0 !important; overflow: hidden !important; }
        .client-details-summary { list-style: none !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 14px !important; padding: 16px 18px !important; }
        .client-details-summary::-webkit-details-marker { display: none !important; }
        .client-details-summary span { display: grid !important; gap: 4px !important; }
        .client-details-summary small { text-transform: uppercase !important; letter-spacing: .16em !important; font-size: 11px !important; line-height: 1 !important; font-weight: 800 !important; color: #9a4c6b !important; }
        .client-details-summary b { font-family: Georgia, "Times New Roman", serif !important; font-size: 25px !important; line-height: 1 !important; color: #262128 !important; }
        .client-details-summary i { width: 34px !important; height: 34px !important; border-radius: 999px !important; display: grid !important; place-items: center !important; border: 1px solid rgba(128, 59, 88, .16) !important; color: #8a3e5e !important; background: rgba(255,255,255,.72) !important; font-style: normal !important; font-size: 22px !important; transition: transform .18s ease !important; }
        .client-add-details[open] .client-details-summary i,
        .clients-list-details[open] .client-details-summary i { transform: rotate(180deg) !important; }
        .compact-client-form { padding: 0 18px 18px !important; gap: 12px !important; }
        .compact-client-form .grid-3 { gap: 10px !important; }
        .compact-client-form label { gap: 5px !important; font-size: 13px !important; }
        .compact-client-form input,
        .compact-client-form select { min-height: 40px !important; border-radius: 11px !important; padding: 9px 11px !important; font-size: 14px !important; }
        .compact-form-actions button { min-height: 40px !important; border-radius: 12px !important; padding: 9px 14px !important; }

        .clients-list-card-wrap { padding: 16px !important; }
        .clients-list-head { display: grid !important; grid-template-columns: minmax(0, 1fr) auto !important; gap: 12px !important; align-items: start !important; }
        .clients-list-head h2 { margin: 0 !important; font-size: clamp(27px, 6vw, 38px) !important; line-height: 1 !important; }
        .clients-list-head p { margin: 7px 0 0 !important; font-size: 14px !important; line-height: 1.3 !important; }
        .clients-list-count { min-height: 28px !important; padding: 6px 10px !important; font-size: 12px !important; line-height: 1 !important; }
        .client-search-form { display: grid !important; grid-template-columns: minmax(0, 1fr) auto auto !important; gap: 8px !important; margin-top: 14px !important; }
        .client-search-form input { min-height: 40px !important; border-radius: 12px !important; padding: 9px 12px !important; font-size: 14px !important; }
        .client-search-form button,
        .client-search-form a { min-height: 40px !important; border-radius: 12px !important; padding: 9px 13px !important; font-size: 13px !important; white-space: nowrap !important; }

        .clients-list-details { margin-top: 12px !important; border: 1px solid rgba(128, 59, 88, .13) !important; border-radius: 15px !important; background: rgba(255,255,255,.46) !important; overflow: hidden !important; }
        .clients-list-details .client-details-summary { padding: 13px 14px !important; }
        .clients-list-details .client-details-summary b { font-size: 20px !important; }
        .clients-list-details .client-details-summary small { letter-spacing: .08em !important; }
        .client-card-list.compact-client-list { display: grid !important; gap: 8px !important; padding: 0 12px 12px !important; }
        .client-list-card.compact-client-row { display: grid !important; grid-template-columns: minmax(0, 1fr) auto !important; align-items: center !important; gap: 10px !important; padding: 10px !important; border-radius: 13px !important; border: 1px solid rgba(128, 59, 88, .12) !important; background: rgba(255,255,255,.74) !important; }
        .client-card-main.compact-client-main { display: grid !important; grid-template-columns: 44px minmax(0, 1fr) !important; align-items: center !important; gap: 10px !important; min-width: 0 !important; }
        .compact-client-main .avatar-preview,
        .compact-client-main .small-avatar { width: 44px !important; height: 44px !important; min-width: 44px !important; border-radius: 12px !important; display: grid !important; place-items: center !important; overflow: hidden !important; }
        .compact-client-main .avatar-preview span { font-size: 20px !important; line-height: 1 !important; }
        .compact-client-text { display: grid !important; gap: 4px !important; min-width: 0 !important; }
        .compact-client-title { display: flex !important; align-items: center !important; gap: 7px !important; min-width: 0 !important; flex-wrap: wrap !important; }
        .compact-client-title h3 { margin: 0 !important; font-size: 15px !important; line-height: 1.15 !important; font-weight: 700 !important; overflow-wrap: anywhere !important; color: #262128 !important; }
        .compact-client-title .status { min-height: 22px !important; padding: 4px 7px !important; font-size: 10.5px !important; line-height: 1 !important; }
        .compact-client-meta { display: flex !important; align-items: center !important; gap: 8px !important; flex-wrap: wrap !important; color: rgba(72, 65, 72, .66) !important; font-size: 12px !important; line-height: 1.2 !important; }
        .compact-client-meta p,
        .compact-client-meta small { margin: 0 !important; font-size: inherit !important; line-height: inherit !important; color: inherit !important; }
        .client-card-actions.compact-client-actions { display: flex !important; align-items: center !important; justify-content: flex-end !important; gap: 6px !important; flex-wrap: wrap !important; }
        .compact-client-actions > a,
        .compact-client-actions > details > summary { min-height: 34px !important; border-radius: 10px !important; padding: 7px 10px !important; font-size: 12px !important; line-height: 1.1 !important; white-space: nowrap !important; }
        .compact-client-actions .soft-details { position: relative !important; }
        .compact-client-actions .soft-details[open] { grid-column: 1 / -1 !important; width: 100% !important; }
        .compact-client-actions .soft-details[open] .inline-edit-card,
        .compact-client-actions .archive-details[open] form { position: absolute !important; right: 0 !important; top: calc(100% + 6px) !important; z-index: 10 !important; width: min(84vw, 360px) !important; padding: 12px !important; border-radius: 14px !important; border: 1px solid rgba(128, 59, 88, .16) !important; background: #fff !important; box-shadow: 0 18px 44px rgba(70, 50, 62, .18) !important; }
        .compact-client-actions .inline-edit-card { gap: 8px !important; }
        .compact-client-actions .inline-edit-card label { gap: 4px !important; font-size: 12px !important; }
        .compact-client-actions .inline-edit-card input,
        .compact-client-actions .inline-edit-card select,
        .compact-client-actions .inline-edit-card textarea,
        .compact-client-actions .archive-details input { min-height: 36px !important; border-radius: 9px !important; padding: 8px 10px !important; font-size: 13px !important; }
        .compact-client-actions .inline-edit-card textarea { min-height: 58px !important; }
        .compact-client-actions .inline-edit-card button,
        .compact-client-actions .archive-details button { min-height: 36px !important; border-radius: 10px !important; font-size: 13px !important; }

        @media (max-width: 760px) {
          .clients-page-clean { gap: 10px !important; }
          .clients-hero { padding: 18px !important; }
          .clients-hero h1 { font-size: 36px !important; }
          .clients-hero p { font-size: 14px !important; }
          .compact-client-form .grid-3,
          .compact-client-form .grid-2 { grid-template-columns: 1fr !important; }
          .clients-list-head { grid-template-columns: 1fr !important; }
          .clients-list-count { width: fit-content !important; }
          .client-search-form { grid-template-columns: 1fr !important; }
          .client-list-card.compact-client-row { grid-template-columns: 1fr !important; align-items: start !important; }
          .client-card-actions.compact-client-actions { justify-content: stretch !important; display: grid !important; grid-template-columns: 1fr 1fr !important; }
          .compact-client-actions > a,
          .compact-client-actions > details > summary { width: 100% !important; justify-content: center !important; text-align: center !important; }
          .compact-client-actions .soft-details[open] .inline-edit-card,
          .compact-client-actions .archive-details[open] form { position: static !important; width: 100% !important; margin-top: 8px !important; }
        }
      `}</style>

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