import { loginClient } from "@/app/actions";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <section className="card auth-card">
      <p className="eyebrow">Для клиентов</p>
      <h1>Вход</h1>
      <p>Телефон и дата рождения. Email не нужен, пароль тоже. Маленькая радость.</p>
      {searchParams.error === "wrong_birthdate" ? <div className="notice danger-notice">Дата не совпала. Проверь цифры — сайт не экстрасенс.</div> : null}
      <form action={loginClient} className="grid">
        <label>Телефон<input name="phone" required placeholder="+7..." /></label>
        <label>Дата рождения<input name="birthDate" required type="date" /></label>
        <button type="submit">Войти</button>
      </form>
    </section>
  );
}
