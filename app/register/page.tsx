import { registerClient } from "@/app/actions";

export default function RegisterPage({ searchParams }: { searchParams: { phone?: string } }) {
  return (
    <section className="card">
      <h1>Регистрация клиента</h1>
      <p>После отправки анкеты мастер проверит заявку и откроет расписание.</p>

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
    </section>
  );
}
