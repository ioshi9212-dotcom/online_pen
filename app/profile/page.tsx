import { updateClientProfile } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function ClientProfilePage({ searchParams }: { searchParams: { client?: string; saved?: string; error?: string } }) {
  const token = searchParams.client;
  if (!token) redirect("/login");

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client) redirect("/login");
  if (client.status !== "APPROVED") redirect("/unavailable");

  return (
    <main className="client-page">
      <section className="hero">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div><h1>Профиль</h1><p>{client.firstName}, здесь можно поправить данные.</p></div>
          <a className="button secondary" href={`/my?client=${token}`}>В кабинет</a>
        </div>
      </section>

      {searchParams.saved ? <div className="notice ok-status">Профиль сохранён.</div> : null}
      {searchParams.error ? <div className="notice danger-status">Проверьте данные.</div> : null}

      <form action={updateClientProfile} className="card grid">
        <input type="hidden" name="clientToken" value={token} />
        <div className="grid-2">
          <label>Имя<input name="firstName" required defaultValue={client.firstName} /></label>
          <label>Фамилия<input name="lastName" required defaultValue={client.lastName} /></label>
        </div>
        <div className="grid-2">
          <label>Телефон<input name="phone" required defaultValue={client.phone} /></label>
          <label>Дата рождения<input name="birthDate" type="date" required defaultValue={toDateInput(client.birthDate)} /></label>
        </div>
        <label>Фото по ссылке<input name="avatarUrl" defaultValue={client.avatarUrl || ""} placeholder="https://..." /></label>
        <div className="actions"><button type="submit">Сохранить</button><a className="button secondary" href={`/my?client=${token}`}>Назад</a></div>
      </form>
    </main>
  );
}
