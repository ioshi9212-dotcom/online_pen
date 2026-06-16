import { updateClientProfile } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = { client?: string; saved?: string; error?: string };
function toDateInput(date: Date) { return date.toISOString().slice(0, 10); }
function ClientMenu({ token, name }: { token: string; name: string }) { return <header className="client-topbar"><a className="client-logo" href={`/my?client=${token}`}><span>O</span><b>Онлайн-запись</b></a><nav><a href={`/my?client=${token}`}>Кабинет</a><a href={`/my?client=${token}#windows`}>Окна</a><a href={`/price?client=${token}`}>Прайс</a><a href={`/booking?client=${token}`}>Записаться</a></nav><div className="client-mini-avatar">{name.slice(0, 1).toUpperCase()}</div></header>; }

export default async function ClientProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const profileId = searchParams.client;
  if (!profileId) redirect("/login");
  const client = await prisma.client.findUnique({ where: { publicToken: profileId } });
  if (!client) redirect("/login");
  if (client.status !== "APPROVED") redirect("/unavailable");
  return <main className="client-shell"><ClientMenu token={profileId} name={client.firstName} /><section className="client-welcome"><div><p className="client-eyebrow">Профиль</p><h1>{client.firstName}</h1><p>Здесь можно поправить имя, телефон, дату рождения и фото по ссылке.</p></div><div className="client-avatar-large">{client.avatarUrl ? <img src={client.avatarUrl} alt="Фото клиента" /> : client.firstName.slice(0, 1).toUpperCase()}</div></section>{searchParams.saved ? <div className="notice ok-notice floating-toast">Профиль сохранён.</div> : null}{searchParams.error === "phone-exists" ? <div className="notice danger-notice floating-toast">Такой телефон уже есть у другого клиента.</div> : null}{searchParams.error === "required" ? <div className="notice danger-notice floating-toast">Заполните обязательные поля.</div> : null}<form action={updateClientProfile} className="client-card client-form"><input type="hidden" name="clientToken" value={profileId} /><div className="grid-2"><label>Имя<input name="firstName" required defaultValue={client.firstName} /></label><label>Фамилия<input name="lastName" required defaultValue={client.lastName} /></label></div><div className="grid-2"><label>Телефон<input name="phone" required defaultValue={client.phone} /></label><label>Дата рождения<input name="birthDate" type="date" required defaultValue={toDateInput(client.birthDate)} /></label></div><label>Фото профиля по ссылке<input name="avatarUrl" defaultValue={client.avatarUrl} placeholder="https://..." /></label><div className="actions"><button type="submit">Сохранить профиль</button><a className="client-button secondary" href={`/my?client=${profileId}`}>Назад в кабинет</a></div></form></main>;
}
