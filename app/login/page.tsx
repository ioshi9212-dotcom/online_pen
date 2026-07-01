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
        <p className="muted">Для тех, кто уже оставлял заявку</p>
        <h1>Я уже зарегистрирована</h1>
        <p>Введите телефон и дату рождения. Если мастер уже подтвердил заявку — откроется кабинет. Если нет — покажем экран ожидания.</p>

        <div className="notice test-version-note">
          <b>Тестовая версия сайта.</b>
          <p>Он старается, честно. Но после записи всё равно напишите мастеру — пусть человек проверит то, что робот красиво наобещал.</p>
        </div>

        {searchParams.error === "wrong_birthdate" ? <div className="notice danger-status">Дата рождения не совпала. Проверь цифры.</div> : null}
        <form action={loginClient} className="grid">
          <label>Телефон<input name="phone" required placeholder="+7..." /></label>
          <label>Дата рождения<input name="birthDate" required type="date" /></label>
          <div className="actions">
            <button type="submit">Войти / проверить статус</button>
            <a className="button secondary" href="/register">Я ещё не зарегистрирована</a>
          </div>
        </form>
      </section>
    </main>
  );
}
