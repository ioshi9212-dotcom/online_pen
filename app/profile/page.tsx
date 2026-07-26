import { getClientCookie } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ProfileAvatarForm from "./ProfileAvatarForm";

export const dynamic = "force-dynamic";

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function errorText(error?: string) {
  if (error === "phone-exists") return "Этот телефон уже есть в другой карточке.";
  if (error === "avatar-type") return "Фото не сохранилось: можно загрузить только JPG, PNG или WEBP.";
  if (error === "avatar-size") return "Фото слишком большое. Выберите фото до 1,5 МБ.";
  if (error) return "Проверьте данные.";
  return "";
}

export default async function ClientProfilePage({ searchParams }: { searchParams: { error?: string } }) {
  const token = getClientCookie();
  if (!token) redirect("/login");

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client) redirect("/login");
  if (client.status !== "APPROVED") redirect("/unavailable");

  const error = errorText(searchParams.error);

  return (
    <main className="client-v2 profile-v2">
      <section className="profile-v2-heading">
        <div>
          <span className="client-v2-kicker">Личный кабинет</span>
          <h1>Профиль</h1>
          <p>{client.firstName}, здесь можно изменить контактные данные и фотографию.</p>
        </div>
        <div className="profile-v2-actions">
          <a className="client-v2-button is-secondary" href="/my">Назад к записи</a>
          <a className="client-v2-text-link" href="/logout">Выйти</a>
        </div>
      </section>

      {error ? <div className="notice danger-status">{error}</div> : null}

      <ProfileAvatarForm
        client={{
          firstName: client.firstName,
          lastName: client.lastName,
          phone: client.phone,
          birthDate: toDateInput(client.birthDate),
          avatarUrl: client.avatarUrl || ""
        }}
      />
    </main>
  );
}
