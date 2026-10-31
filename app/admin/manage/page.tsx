import SubmitButton from "@/app/SubmitButton";
import ManualBookingForm from "./ManualBookingForm";
import { validDateKey, validTime } from "@/lib/validation";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { CLIENT_STATUS_OPTIONS } from "@/lib/statusLabels";
import { redirect } from "next/navigation";
import { createManualClient } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function Notice({ searchParams }: { searchParams: SearchParams }) {
  const client = one(searchParams, "client");
  const booking = one(searchParams, "booking");
  const bookingError = one(searchParams, "bookingError");

  if (bookingError) return <div className="notice danger-notice floating-toast">Запись не сохранена: {bookingError}.</div>;
  if (client === "created") return <div className="notice ok-notice floating-toast">Клиент добавлен и выбран для записи.</div>;
  if (client === "existing") return <div className="notice ok-notice floating-toast">Клиент найден по телефону и выбран для записи.</div>;
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
            <SubmitButton>Создать и выбрать</SubmitButton>
            <a className="button secondary" href="/admin/my-clients#add-client">Полная база клиентов</a>
          </div>
        </form>
      </div>
    </details>
  );
}

export default async function ManualAdminPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<SearchParams> }) {
  const searchParams = (await searchParamsPromise) || {};

  if (!(await isAdmin())) redirect("/admin/login");

  const selectedClientId = one(searchParams, "clientId") || "";
  const addOpen = one(searchParams, "add") === "1";

  const [bookableClients, services] = await Promise.all([
    prisma.client.findMany({ where: { status: "APPROVED" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })
  ]);

  const selectedClientExists = bookableClients.some((client) => client.id === selectedClientId);

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
          <ManualBookingForm
            clients={bookableClients.map((client) => ({ id: client.id, name: `${client.lastName} ${client.firstName}`, phone: client.phone }))}
            services={services.map((service) => ({ id: service.id, title: service.title, durationMinutes: service.durationMinutes, price: service.price }))}
            initialClientId={selectedClientExists ? selectedClientId : ""}
            initialStart={validDateKey(one(searchParams, "date") || "") ? `${one(searchParams, "date")}T${validTime(one(searchParams, "time") || "") ? one(searchParams, "time") : "09:00"}` : ""}
          />
        )}
      </section>
    </div>
  );
}
