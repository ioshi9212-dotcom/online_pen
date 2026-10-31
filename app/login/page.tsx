import SubmitButton from "@/app/SubmitButton";
import { loginClient } from "@/app/actions";
import { getClientCookie } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ error?: string; known?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};

  const savedClientToken = await getClientCookie();
  if (savedClientToken) {
    const savedClient = await prisma.client.findUnique({ where: { publicToken: savedClientToken }, select: { status: true } });
    if (savedClient?.status === "APPROVED") redirect("/my");
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

        {searchParams.known ? <div className="notice">Этот телефон уже есть в базе. Войдите с датой рождения, чтобы продолжить или проверить статус.</div> : null}
        {searchParams.error ? <div className="notice danger-status">{searchParams.error === "rate" ? "Слишком много попыток. Попробуйте через 30 минут." : "Телефон или дата рождения не совпали. Проверьте данные."}</div> : null}
        <form action={loginClient} className="grid">
          <label>Телефон<input name="phone" type="tel" autoComplete="tel" required placeholder="+7 999 123-45-67" /></label>
          <label>Дата рождения<input name="birthDate" required type="date" /></label>
          <div className="actions">
            <SubmitButton pendingText="Вхожу…">Войти</SubmitButton>
            <a className="button secondary" href="/register">Регистрация</a>
          </div>
        </form>
      </section>
    </main>
  );
}
