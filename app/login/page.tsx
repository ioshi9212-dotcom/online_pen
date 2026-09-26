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
        <p className="muted">Вход для клиентов</p>
        <h1>Войти</h1>
        <p>Введите телефон и дату рождения. Если доступ уже подтверждён, сразу откроется личный кабинет. Если заявка ещё на проверке, покажем её статус.</p>

        <div className="notice test-version-note">
          <b>После записи дождитесь подтверждения.</b>
          <p>Заявка на время сначала попадёт мастеру. Когда запись будет подтверждена, её статус изменится в личном кабинете.</p>
        </div>

        {searchParams.error === "wrong_birthdate" ? <div className="notice danger-status">Дата рождения не совпала. Проверь цифры.</div> : null}
        <form action={loginClient} className="grid">
          <label>Телефон<input name="phone" required placeholder="+7..." /></label>
          <label>Дата рождения<input name="birthDate" required type="date" /></label>
          <div className="actions">
            <button type="submit">Войти</button>
            <a className="button secondary" href="/register">Я новый клиент</a>
          </div>
        </form>
      </section>
    </main>
  );
}
