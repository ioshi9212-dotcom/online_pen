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

export default async function ClientProfilePage({ searchParams }: { searchParams: { client?: string; error?: string } }) {
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
          <div className="actions">
            <a className="button secondary" href={`/my?client=${token}`}>В кабинет</a>
            <a className="button secondary" href="/logout">Выйти</a>
          </div>
        </div>
      </section>

      {error ? <div className="notice danger-status">{error}</div> : null}

      <ProfileAvatarForm
        token={token}
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
