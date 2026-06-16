import { registerClient } from "@/app/actions";

export default function RegisterPage({ searchParams }: { searchParams: { phone?: string } }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Регистрация</h1>
        <p>После подтверждения откроется личный кабинет со свободными окнами.</p>
        <form action={registerClient} className="grid">
          <div className="grid-2">
            <label>Имя<input name="firstName" required /></label>
            <label>Фамилия<input name="lastName" required /></label>
          </div>
          <div className="grid-2">
            <label>Телефон<input name="phone" required defaultValue={searchParams.phone || ""} /></label>
            <label>Дата рождения<input name="birthDate" required type="date" /></label>
          </div>
          <label>Комментарий<textarea name="comment" /></label>
          <div className="actions"><button type="submit">Отправить заявку</button><a className="button secondary" href="/login">Я уже клиент</a></div>
        </form>
      </section>
    </main>
  );
}
