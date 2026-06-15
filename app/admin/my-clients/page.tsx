import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { CLIENT_STATUS_OPTIONS, clientStatusLabel, statusClass } from "@/lib/statusLabels";
import { redirect } from "next/navigation";
import { archiveClient, saveMyClient } from "./actions";

export const dynamic = "force-dynamic";

const activeStatuses = ["PENDING", "APPROVED", "BANNED"];

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function DoneNotice({ done }: { done?: string }) {
  const map: Record<string, string> = {
    saved: "Клиент сохранён.",
    merged: "Карточки объединены по телефону. Записи и лист ожидания перенесены сюда.",
    archived: "Клиент отправлен в архив.",
    "not-found": "Клиент не найден. Возможно, карточка уже была объединена."
  };

  const text = done ? map[done] : "";
  if (!text) return null;

  return <div className="notice ok-notice">Готово: {text}</div>;
}

export default async function MyClientsPage({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  if (!isAdmin()) redirect("/admin/login");

  const done = one(searchParams.done);
  const clients = await prisma.client.findMany({
    where: { status: { in: activeStatuses as any } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  return (
    <section className="card">
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Мои клиенты</h1>
          <p>Активная клиентская база. Телефон — главный ключ: если номер совпал, карточки объединяются.</p>
        </div>
        <div className="actions">
          <a className="button secondary" href="/admin/manage">Ручная запись</a>
          <a className="button secondary" href="/admin/archive">Архив</a>
          <a className="button secondary" href="/admin">Админка</a>
        </div>
      </div>

      <DoneNotice done={done} />

      {clients.length === 0 ? <div className="notice">Клиентов пока нет.</div> : null}

      <table className="table">
        <thead><tr><th>Клиент</th><th>Контакты/статус</th><th>Заметки</th><th>Архив</th></tr></thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id}>
              <td>
                <form id={`client-${client.id}`} action={saveMyClient} className="grid">
                  <input type="hidden" name="id" value={client.id} />
                  <input name="lastName" defaultValue={client.lastName} required />
                  <input name="firstName" defaultValue={client.firstName} required />
                  <input name="birthDate" type="date" defaultValue={toDateInput(client.birthDate)} required />
                </form>
              </td>
              <td>
                <div className="grid">
                  <input name="phone" form={`client-${client.id}`} defaultValue={client.phone} required />
                  <select name="status" form={`client-${client.id}`} defaultValue={client.status}>
                    {CLIENT_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                  <span className={`status ${statusClass(client.status)}`}>{clientStatusLabel(client.status)}</span>
                  <span className="small">Создан: {client.createdAt.toLocaleDateString("ru-RU")}</span>
                </div>
              </td>
              <td><textarea name="notes" form={`client-${client.id}`} defaultValue={client.notes} /></td>
              <td className="actions">
                <button type="submit" form={`client-${client.id}`} className="ok">Сохранить</button>
                <form action={archiveClient} className="grid">
                  <input type="hidden" name="id" value={client.id} />
                  <input name="archiveReason" placeholder="причина архива" />
                  <button type="submit" className="danger">В архив</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
