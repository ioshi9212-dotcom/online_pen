import { loginClient } from "@/app/actions";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <section className="card">
      <h1>Вход клиента</h1>
      <p>Введите телефон и дату рождения. Email не нужен.</p>
      {searchParams.error === "wrong_birthdate" ? <div className="notice">Дата рождения не совпала. Проверьте ввод.</div> : null}
      <form action={loginClient} className="grid">
        <label>Телефон<input name="phone" required placeholder="+7..." /></label>
        <label>Дата рождения<input name="birthDate" required type="date" /></label>
        <button type="submit">Войти</button>
      </form>
    </section>
  );
}
