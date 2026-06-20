import { registerClient } from "@/app/actions";

export default function RegisterPage({ searchParams }: { searchParams: { phone?: string; rejected?: string } }) {
  const rejected = searchParams.rejected === "1";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="muted">Новая заявка</p>
        <h1>Регистрация</h1>
        <p>После подтверждения мастера откроется личный кабинет со свободными окнами.</p>
        {rejected ? (
          <div className="notice danger-notice">
            Предыдущая заявка была отклонена мастером. Можно заполнить форму заново и отправить новую заявку.
          </div>
        ) : (
          <div className="notice">
            Уже отправляли заявку? Не заполняйте заново — нажмите “Я уже зарегистрирован” и проверьте статус.
          </div>
        )}
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
          <div className="actions">
            <button type="submit">Отправить заявку</button>
            <a className="button secondary" href="/login">Я уже зарегистрирован</a>
          </div>
        </form>
      </section>
    </main>
  );
}
