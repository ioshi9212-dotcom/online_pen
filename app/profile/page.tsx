import { updateClientProfile } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = { client?: string; saved?: string; error?: string };

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function ClientProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const profileId = searchParams.client;
  if (!profileId) redirect("/login");

  const client = await prisma.client.findUnique({ where: { publicToken: profileId } });
  if (!client) redirect("/login");
  if (client.status !== "APPROVED") redirect("/unavailable");

  return (
    <section className="grid profile-page">
      <div className="card profile-hero">
        <div className="avatar-preview">
          {client.avatarUrl ? <img src={client.avatarUrl} alt="Фото клиента" /> : <span>{client.firstName.slice(0, 1).toUpperCase()}</span>}
        </div>
        <div>
          <p className="eyebrow">Личный кабинет</p>
          <h1>Профиль</h1>
          <p>Здесь можно поправить имя, телефон, дату рождения и фото по ссылке.</p>
        </div>
        <div className="actions profile-actions">
          <a className="button secondary" href={`/my?client=${profileId}`}>Мои записи</a>
          <a className="button secondary" href={`/booking?client=${profileId}`}>Новая запись</a>
        </div>
      </div>

      {searchParams.saved ? <div className="notice ok-notice">Профиль сохранён.</div> : null}
      {searchParams.error === "phone-exists" ? <div className="notice danger-notice">Такой телефон уже есть у другого клиента.</div> : null}
      {searchParams.error === "required" ? <div className="notice danger-notice">Заполни обязательные поля.</div> : null}

      <form action={updateClientProfile} className="card grid profile-form">
        <input type="hidden" name="clientToken" value={profileId} />
        <div className="grid-2">
          <label>Имя<input name="firstName" required defaultValue={client.firstName} /></label>
          <label>Фамилия<input name="lastName" required defaultValue={client.lastName} /></label>
        </div>
        <div className="grid-2">
          <label>Телефон / WhatsApp<input name="phone" required defaultValue={client.phone} /></label>
          <label>Дата рождения<input name="birthDate" type="date" required defaultValue={toDateInput(client.birthDate)} /></label>
        </div>
        <label>Фото профиля по ссылке
          <input name="avatarUrl" defaultValue={client.avatarUrl} placeholder="https://..." />
          <small>Сейчас фото добавляется ссылкой на изображение. Загрузку файла можно сделать позже через хранилище.</small>
        </label>
        <div className="actions">
          <button type="submit">Сохранить профиль</button>
          <a className="button secondary" href={`/my?client=${profileId}`}>Назад в кабинет</a>
        </div>
      </form>
    </section>
  );
}
