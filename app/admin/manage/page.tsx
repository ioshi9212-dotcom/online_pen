import { isAdmin } from "@/lib/admin";
import { DURATION_OPTIONS, durationLabel } from "@/lib/durations";
import { rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { BOOKING_STATUS_OPTIONS, CLIENT_STATUS_OPTIONS } from "@/lib/statusLabels";
import { redirect } from "next/navigation";
import { createManualBooking, createManualClient } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function DurationSelect({ defaultValue }: { defaultValue: number }) {
  return (
    <select name="durationMinutes" defaultValue={String(defaultValue)}>
      {DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function Notice({ searchParams }: { searchParams: SearchParams }) {
  const client = one(searchParams, "client");
  const booking = one(searchParams, "booking");
  const bookingError = one(searchParams, "bookingError");

  if (bookingError) return <div className="notice danger-notice floating-toast">Запись не сохранена: {bookingError}.</div>;
  if (client === "created") return <div className="notice ok-notice floating-toast">Клиент добавлен и выбран для записи.</div>;
  if (client === "merged") return <div className="notice ok-notice floating-toast">Клиент найден по телефону и выбран для записи.</div>;
  if (booking === "created") return <div className="notice ok-notice floating-toast">Запись создана.</div>;

  return null;
}

function AddClientPanel({ open }: { open: boolean }) {
  return (
    <details className="card soft-details add-client-panel" id="add-client" open={open}>
      <summary className="button secondary">Добавить клиента</summary>
      <div className="grid" style={{ marginTop: 18 }}>
        <div>
          <h2>Новая карточка клиента</h2>
          <p className="small">Создай клиента здесь же. После сохранения он сразу выберется в форме записи ниже, а поля очистятся.</p>
        </div>
        <form action={createManualClient} className="grid">
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
            <button type="submit">Создать и выбрать</button>
            <a className="button secondary" href="/admin/my-clients#add-client">Полная база клиентов</a>
          </div>
        </form>
      </div>
    </details>
  );
}

export default async function ManualAdminPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  if (!isAdmin()) redirect("/admin/login");

  const selectedClientId = one(searchParams, "clientId") || "";
  const addOpen = one(searchParams, "add") === "1";

  const [bookableClients, services] = await Promise.all([
    prisma.client.findMany({ where: { status: "APPROVED" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })
  ]);

  const defaultServiceDuration = services[0]?.durationMinutes || 150;
  const selectedClientExists = bookableClients.some((client) => client.id === selectedClientId);
  const bookingClientDefault = selectedClientExists ? selectedClientId : bookableClients[0]?.id;

  return (
    <div className="grid">
      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h1>Запись вручную</h1>
            <p>Только ручная запись мастером. Клиенты и записи редактируются в своих разделах, чтобы тут не было каши.</p>
          </div>
          <div className="actions">
            <a className="button" href="/admin/manage?add=1#add-client">Добавить клиента</a>
            <a className="button secondary" href="/admin/my-clients">Клиенты</a>
            <a className="button secondary" href="/admin">Админка</a>
            <a className="button secondary" href="/admin/logout">Выйти</a>
          </div>
        </div>
      </section>

      <Notice searchParams={searchParams} />
      <AddClientPanel open={addOpen || bookableClients.length === 0} />

      <section className="card" id="manual-booking">
        <div className="section-head">
          <div>
            <p className="eyebrow">Основное действие</p>
            <h2>Записать клиентку</h2>
            <p>Выбери клиентку, услугу, дату и время. Неподтверждённые и подтверждённые записи занимают окно, поэтому конфликт система не даст сохранить.</p>
          </div>
          {selectedClientExists ? <span className="status ok-status">клиент выбран</span> : null}
        </div>

        {selectedClientExists ? <div className="notice ok-notice">Клиент уже выбран из базы. Осталось выбрать услугу, дату и время.</div> : null}

        {bookableClients.length === 0 ? (
          <div className="empty-state">
            <h3>Нет подтверждённых клиентов</h3>
            <p>Сначала создай карточку клиента через кнопку выше, потом сразу запишешь её здесь же.</p>
            <a className="button" href="/admin/manage?add=1#add-client">Добавить клиента</a>
          </div>
        ) : services.length === 0 ? (
          <div className="empty-state">
            <h3>Нет активных услуг</h3>
            <p>Сначала добавь услугу в прайсе, иначе записывать просто не на что.</p>
            <a className="button" href="/admin/services">Открыть прайс</a>
          </div>
        ) : (
          <form action={createManualBooking} className="grid manual-booking-form">
            <div className="grid-3">
              <label>Клиент
                <select name="clientId" defaultValue={bookingClientDefault}>
                  {bookableClients.map((client) => <option key={client.id} value={client.id}>{client.lastName} {client.firstName} — {client.phone}</option>)}
                </select>
              </label>
              <label>Услуга
                <select name="serviceId">
                  {services.map((service) => <option key={service.id} value={service.id}>{service.title} — {durationLabel(service.durationMinutes)} — {rub(service.price)}</option>)}
                </select>
              </label>
              <label>Дата и время<input name="startAt" type="datetime-local" required /></label>
            </div>

            <div className="grid-3">
              <label>Длительность<DurationSelect defaultValue={defaultServiceDuration} /></label>
              <label>Статус
                <select name="status" defaultValue="CONFIRMED">
                  {BOOKING_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
              <label>Итоговая цена<input name="finalPrice" type="number" min="0" placeholder="если отличается" /></label>
            </div>

            <label>Комментарий клиента<input name="clientComment" placeholder="что просила клиентка" /></label>
            <label>Заметка мастера<textarea name="adminComment" placeholder="дизайн, нюансы, предоплата, что не забыть" /></label>

            <div className="actions">
              <button type="submit">Создать запись</button>
              <a className="button secondary" href="/admin/schedule">Открыть расписание</a>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
