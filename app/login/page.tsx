import { loginClient } from "@/app/actions";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="client-shell client-auth-page">
      <header className="client-topbar">
        <a className="client-logo" href="/"><span>O</span><b>Онлайн-запись</b></a>
        <nav><a href="/register">Записаться</a><a href="/price">Прайс</a></nav>
        <div className="client-mini-avatar">↳</div>
      </header>

      <section className="client-card client-auth-card">
        <p className="client-eyebrow">Для клиентов</p>
        <h1>Вход</h1>
        <p>Введите телефон и дату рождения. Без почты, пароля и маленького нервного квеста.</p>
        {searchParams.error === "wrong_birthdate" ? <div className="notice danger-notice">Дата не совпала. Проверь цифры.</div> : null}
        <form action={loginClient} className="client-form">
          <label>Телефон<input name="phone" required placeholder="+7..." /></label>
          <label>Дата рождения<input name="birthDate" required type="date" /></label>
          <button type="submit">Войти</button>
        </form>
        <div className="actions" style={{ marginTop: 18 }}>
          <a className="client-button secondary" href="/register">Я новая — отправить заявку</a>
          <a className="client-link" href="/">На главную</a>
        </div>
      </section>
    </main>
  );
}
