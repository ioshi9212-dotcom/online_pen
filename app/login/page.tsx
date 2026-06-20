import { loginClient } from "@/app/actions";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="muted">Для тех, кто уже оставлял заявку</p>
        <h1>Я уже зарегистрирован</h1>
        <p>Введите телефон и дату рождения. Если мастер уже подтвердил заявку — откроется кабинет. Если нет — покажем экран ожидания.</p>
        {searchParams.error === "wrong_birthdate" ? <div className="notice danger-status">Дата рождения не совпала. Проверь цифры.</div> : null}
        <form action={loginClient} className="grid">
          <label>Телефон<input name="phone" required placeholder="+7..." /></label>
          <label>Дата рождения<input name="birthDate" required type="date" /></label>
          <div className="actions">
            <button type="submit">Войти / проверить статус</button>
            <a className="button secondary" href="/register">Я новый клиент</a>
          </div>
        </form>
      </section>
    </main>
  );
}
