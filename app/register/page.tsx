import { registerClient } from "@/app/actions";

export default function RegisterPage({ searchParams }: { searchParams: { phone?: string } }) {
  return (
    <main className="client-shell client-auth-page">
      <header className="client-topbar">
        <a className="client-logo" href="/"><span>O</span><b>Онлайн-запись</b></a>
        <nav>
          <a href="/login">Вход</a>
          <a href="/price">Прайс</a>
        </nav>
        <div className="client-mini-avatar">O</div>
      </header>

      <section className="client-card client-auth-card wide">
        <p className="client-eyebrow">Новая заявка</p>
        <h1>Регистрация</h1>
        <p>После подтверждения откроется личный кабинет со свободными окнами.</p>
        <form action={registerClient} className="client-form">
          <div className="grid-2">
            <label>Имя<input name="firstName" required /></label>
            <label>Фамилия<input name="lastName" required /></label>
          </div>
          <div className="grid-2">
            <label>Телефон<input name="phone" required defaultValue={searchParams.phone || ""} /></label>
            <label>Дата рождения<input name="birthDate" required type="date" /></label>
          </div>
          <label>Комментарий<textarea name="comment" /></label>
          <button type="submit">Отправить заявку</button>
        </form>
        <div className="actions" style={{ marginTop: 18 }}>
          <a className="client-button secondary" href="/login">Я уже клиент</a>
          <a className="client-link" href="/price">Прайс</a>
          <a className="client-link" href="/">На главную</a>
        </div>
      </section>
    </main>
  );
}
