import { approveClient, rejectClient } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function RequestsPage() {
  if (!isAdmin()) redirect("/admin/login");
  const clients = await prisma.client.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" } });

  return (
    <section className="card">
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Заявки клиентов</h1>
          <p>Новые заявки на доступ. Подтверждай своих, остальных — аккуратно мимо.</p>
        </div>
        <div className="actions">
          <a className="button secondary" href="/admin">Админка</a>
          <a className="button secondary" href="/admin/my-clients">Мои клиенты</a>
        </div>
      </div>

      {clients.length === 0 ? <div className="notice">Новых заявок нет. Тишина, порядок, подозрительно приятно.</div> : null}

      <table className="table">
        <thead><tr><th>Клиент</th><th>Телефон</th><th>ДР</th><th>Комментарий</th><th></th></tr></thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id}>
              <td>{client.lastName} {client.firstName}</td>
              <td>{client.phone}</td>
              <td>{client.birthDate.toISOString().slice(0, 10)}</td>
              <td>{client.notes}</td>
              <td className="actions">
                <form action={approveClient}><input type="hidden" name="id" value={client.id} /><button className="ok">Подтвердить</button></form>
                <form action={rejectClient}><input type="hidden" name="id" value={client.id} /><button className="danger">Отклонить</button></form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
