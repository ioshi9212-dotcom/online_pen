import { registerClient } from "@/app/actions";

export default function RegisterPage({ searchParams }: { searchParams: { phone?: string; rejected?: string } }) {
  const rejected = searchParams.rejected === "1";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="muted">Первый вход</p>
        <h1>Новый клиент</h1>
        <p>Заполните форму один раз. После подтверждения откроется личный кабинет со свободными окнами.</p>

        <div className="notice test-version-note">
          <b>Что будет дальше?</b>
          <p>Я проверю заявку и открою доступ. После этого вы сможете входить по телефону и дате рождения без повторной регистрации.</p>
        </div>

        {rejected ? (
          <div className="notice danger-notice">
            Предыдущая заявка была отклонена мастером. Можно заполнить форму заново и отправить новую заявку.
          </div>
        ) : (
          <div className="notice">
            Уже отправляли заявку? Не заполняйте форму заново. Нажмите «Войти» и проверьте статус.
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
            <a className="button secondary" href="/login">Войти</a>
          </div>
        </form>
      </section>
    </main>
  );
}
