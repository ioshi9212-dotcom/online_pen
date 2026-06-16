import { registerClient } from "@/app/actions";

export default function RegisterPage({ searchParams }: { searchParams: { phone?: string } }) {
  return (
    <section className="card auth-card">
      <p className="eyebrow">Новая заявка</p>
      <h1>Регистрация</h1>
      <p>После отправки я подтверждаю доступ. Только после этого откроется расписание.</p>

      <form action={registerClient} className="grid">
        <div className="grid-2">
          <label>Имя<input name="firstName" required placeholder="Мария" /></label>
          <label>Фамилия<input name="lastName" required placeholder="Иванова" /></label>
        </div>
        <div className="grid-2">
          <label>Телефон / WhatsApp<input name="phone" required defaultValue={searchParams.phone || ""} placeholder="+7..." /></label>
          <label>Дата рождения<input name="birthDate" required type="date" /></label>
        </div>
        <label>Комментарий<textarea name="comment" placeholder="Например: хочу на коррекцию, удобнее вечером" /></label>
        <button type="submit">Отправить заявку</button>
      </form>

      <div className="actions" style={{ marginTop: 18 }}>
        <a className="button secondary" href="/login">Я уже клиент</a>
        <a className="button secondary" href="/price">Прайс</a>
        <a className="quiet-link" href="/">На главную</a>
      </div>
    </section>
  );
}
