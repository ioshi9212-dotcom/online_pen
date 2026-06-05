import { banClient, saveClientNote } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { clientStatusLabel, statusClass } from "@/lib/statusLabels";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  if (!isAdmin()) redirect("/admin/login");
  const clients = await prisma.client.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });

  return (
    <section className="card">
      <h1>Клиенты</h1>
      <table className="table">
        <thead><tr><th>Клиент</th><th>Телефон</th><th>Статус</th><th>Заметки</th><th></th></tr></thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id}>
              <td>{client.lastName} {client.firstName}<br /><span className="small">ДР: {client.birthDate.toISOString().slice(0, 10)}</span></td>
              <td>{client.phone}</td>
              <td><span className={`status ${statusClass(client.status)}`}>{clientStatusLabel(client.status)}</span></td>
              <td>
                <form action={saveClientNote} className="grid">
                  <input type="hidden" name="id" value={client.id} />
                  <textarea name="notes" defaultValue={client.notes} />
                  <button className="secondary">Сохранить заметку</button>
                </form>
              </td>
              <td>
                {client.status !== "BANNED" ? (
                  <form action={banClient}><input type="hidden" name="id" value={client.id} /><button className="danger">Заблокировать</button></form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
