import { updateClientProfile } from "@/app/actions";
import { getClientCookie } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function errorText(error?: string) {
  if (error === "phone-exists") return "Этот телефон уже есть в другой карточке.";
  if (error === "avatar-type") return "Фото не сохранилось: можно загрузить только JPG, PNG или WEBP.";
  if (error === "avatar-size") return "Фото слишком большое. Выберите фото до 1,5 МБ.";
  if (error === "avatar-read") return "Фото не удалось прочитать. Попробуйте другое изображение.";
  if (error) return "Проверьте данные.";
  return "";
}

export default async function ClientProfilePage({ searchParams }: { searchParams: { client?: string; saved?: string; error?: string } }) {
  const token = searchParams.client || getClientCookie();
  if (!token) redirect("/login");
  if (!searchParams.client) redirect(`/profile?client=${token}`);

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client) redirect("/login");
  if (client.status !== "APPROVED") redirect("/unavailable");

  const error = errorText(searchParams.error);

  return (
    <main className="client-page">
      <section className="hero">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div><h1>Профиль</h1><p>{client.firstName}, здесь можно поправить данные и поставить фото.</p></div>
          <a className="button secondary" href={`/my?client=${token}`}>В кабинет</a>
        </div>
      </section>

      {searchParams.saved ? <div className="notice ok-status">Профиль сохранён.</div> : null}
      {error ? <div className="notice danger-status">{error}</div> : null}

      <form action={updateClientProfile} className="card grid avatar-upload-form" encType="multipart/form-data">
        <input type="hidden" name="clientToken" value={token} />

        <div className="profile-avatar-upload">
          <div className="avatar-preview profile-avatar-preview">
            {client.avatarUrl ? <img src={client.avatarUrl} alt="Фото клиента" /> : <span>{client.firstName.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div>
            <label>Фото клиента
              <input name="avatarFile" type="file" accept="image/png,image/jpeg,image/webp" />
            </label>
            <p className="muted">Загрузите фото с телефона. Ссылка больше не нужна. Лучше квадратное фото до 1,5 МБ.</p>
            {client.avatarUrl ? <label className="avatar-remove-check"><input name="removeAvatar" type="checkbox" /> Убрать фото</label> : null}
          </div>
        </div>

        <div className="grid-2">
          <label>Имя<input name="firstName" required defaultValue={client.firstName} /></label>
          <label>Фамилия<input name="lastName" required defaultValue={client.lastName} /></label>
        </div>
        <div className="grid-2">
          <label>Телефон<input name="phone" required defaultValue={client.phone} /></label>
          <label>Дата рождения<input name="birthDate" type="date" required defaultValue={toDateInput(client.birthDate)} /></label>
        </div>
        <div className="actions"><button type="submit">Сохранить</button><a className="button secondary" href={`/my?client=${token}`}>Назад</a></div>
      </form>
    </main>
  );
}
