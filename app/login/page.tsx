import { loginClient } from "@/app/actions";
import { getClientCookie } from "@/lib/clientSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  error?: string;
  known?: string;
  phone?: string;
};

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const savedClientToken = getClientCookie();
  if (savedClientToken) {
    const savedClient = await prisma.client.findUnique({
      where: { publicToken: savedClientToken },
      select: { status: true }
    });
    if (savedClient?.status === "APPROVED") redirect("/my");
  }

  return (
    <main className="client-v2 auth-v2">
      <section className="auth-v2-card is-compact">
        <div className="auth-v2-heading">
          <span className="client-v2-kicker">Вход для клиента</span>
          <h1>Открыть расписание</h1>
          <p>Введите телефон и дату рождения. Если доступ уже открыт, сразу покажем свободное время.</p>
        </div>

        {searchParams.known ? (
          <div className="client-v2-flash">Этот номер уже зарегистрирован. Подтвердите дату рождения, чтобы войти безопасно.</div>
        ) : null}
        {searchParams.error === "wrong-birthdate" ? (
          <div className="client-v2-flash is-error">Дата рождения не совпала. Проверьте цифры.</div>
        ) : null}
        {searchParams.error === "too-many-attempts" ? (
          <div className="client-v2-flash is-error">Слишком много попыток. Подождите 15 минут.</div>
        ) : null}
        {searchParams.error === "session-required" ? (
          <div className="client-v2-flash">Ссылка устарела. Войдите — дальше адрес кабинета будет безопасным и без токена.</div>
        ) : null}

        <form action={loginClient} className="client-v2-form auth-v2-form">
          <label>Телефон<input name="phone" type="tel" autoComplete="tel" required placeholder="+7 900 000-00-00" defaultValue={searchParams.phone || ""} /></label>
          <label>Дата рождения<input name="birthDate" autoComplete="bday" required type="date" /></label>
          <button type="submit">Войти и открыть расписание</button>
        </form>

        <p className="auth-v2-switch">Впервые здесь? <a href="/register">Запросить доступ</a></p>
      </section>
    </main>
  );
}
