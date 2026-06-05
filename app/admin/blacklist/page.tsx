import { unbanClient } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function BlacklistPage() {
  if (!isAdmin()) redirect("/admin/login");
  const clients = await prisma.client.findMany({ where: { status: "BANNED" }, orderBy: { bannedAt: "desc" } });

  return (
    <section className="card">
      <h1>Чёрный список</h1>
      <table className="table">
        <thead><tr><th>Клиент</th><th>Телефон</th><th>Заметки</th><th></th></tr></thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id}>
              <td>{client.lastName} {client.firstName}</td>
              <td>{client.phone}</td>
              <td>{client.notes}</td>
              <td><form action={unbanClient}><input type="hidden" name="id" value={client.id} /><button className="ok">Вернуть доступ</button></form></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
