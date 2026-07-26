import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { saveMasterProfile } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function settingValue(settings: Array<{ key: string; value: string }>, key: string, fallback = "") {
  return settings.find((item) => item.key === key)?.value || fallback;
}

export default async function AdminProfilePage({ searchParams = {} }: { searchParams?: SearchParams }) {
  if (!isAdmin()) redirect("/admin/login");

  const settings = await prisma.setting.findMany({ where: { key: { in: ["master_name", "master_phone", "master_photo_url"] } } });
  const masterName = settingValue(settings, "master_name", "Мастер");
  const masterPhone = settingValue(settings, "master_phone");
  const masterPhotoUrl = settingValue(settings, "master_photo_url");

  return (
    <section className="grid profile-page">
      <div className="card profile-hero">
        <div className="avatar-preview">
          {masterPhotoUrl ? <img src={masterPhotoUrl} alt="Фото мастера" /> : <span>{masterName.slice(0, 1).toUpperCase()}</span>}
        </div>
        <div>
          <p className="eyebrow">Кабинет мастера</p>
          <h1>Профиль</h1>
          <p>Имя, контакт и фото по ссылке.</p>
        </div>
        <div className="actions profile-actions">
          <a className="button secondary" href="/admin">Админка</a>
          <a className="button secondary" href="/admin/logout">Выйти</a>
        </div>
      </div>

      {one(searchParams, "saved") ? <div className="notice ok-notice">Профиль мастера сохранён.</div> : null}
      {one(searchParams, "error") === "short-password" ? <div className="notice danger-notice">Пароль должен быть минимум 12 символов.</div> : null}
      {one(searchParams, "error") === "password-mismatch" ? <div className="notice danger-notice">Пароли не совпали.</div> : null}

      <form action={saveMasterProfile} className="card grid profile-form">
        <div className="grid-2">
          <label>Имя мастера<input name="masterName" defaultValue={masterName} placeholder="Анастасия" /></label>
          <label>Телефон / WhatsApp<input name="masterPhone" defaultValue={masterPhone} placeholder="+7..." /></label>
        </div>
        <label>Фото профиля по ссылке
          <input name="masterPhotoUrl" defaultValue={masterPhotoUrl} placeholder="https://..." />
          <small>Загрузку файла можно сделать позже через отдельное хранилище. Сейчас фото работает как ссылка на изображение.</small>
        </label>
        <div className="profile-password-box">
          <div>
            <h2>Пароль админки</h2>
            <p>Заполняйте только если нужно поменять вход в кабинет мастера.</p>
          </div>
          <div className="grid-2">
            <label>Новый пароль<input name="newAdminPassword" type="password" autoComplete="new-password" /></label>
            <label>Повторить пароль<input name="repeatAdminPassword" type="password" autoComplete="new-password" /></label>
          </div>
        </div>
        <div className="actions">
          <button type="submit">Сохранить профиль</button>
          <a className="button secondary" href="/admin">Назад</a>
        </div>
      </form>
    </section>
  );
}
