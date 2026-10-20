import { loginClient } from "@/app/actions";
import { getClientCookie } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const savedClientToken = getClientCookie();
  if (savedClientToken) {
    const savedClient = await prisma.client.findUnique({ where: { publicToken: savedClientToken }, select: { status: true } });
    if (savedClient?.status === "APPROVED") redirect(`/my?client=${savedClientToken}`);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="muted">Личный кабинет</p>
        <h1>Вход</h1>
        <p>Введите телефон и дату рождения. Здесь же можно проверить статус заявки.</p>

        <div className="notice test-version-note">
          <b>Сайт в тестовом режиме</b>
          <p>После записи напишите мастеру для проверки.</p>
        </div>

        {searchParams.error === "wrong_birthdate" ? <div className="notice danger-status">Дата рождения не совпала. Проверь цифры.</div> : null}
        <form action={loginClient} className="grid">
          <label>Телефон<input name="phone" type="tel" autoComplete="tel" required placeholder="+7 999 123-45-67" /></label>
          <label>Дата рождения<input name="birthDate" required type="date" /></label>
          <div className="actions">
            <button type="submit">Войти</button>
            <a className="button secondary" href="/register">Регистрация</a>
          </div>
        </form>
      </section>
    </main>
  );
}
