export default function HomePage() {
  const whatsapp = process.env.NEXT_PUBLIC_MASTER_WHATSAPP;

  return (
    <section className="hero">
      <div className="card">
        <span className="pill">Закрытая онлайн-запись</span>
        <h1>Запись только после подтверждения мастером</h1>
        <p>
          Сначала клиент оставляет анкету. После подтверждения открывается расписание, прайс и личный кабинет с записями.
        </p>
        <div className="actions">
          <a className="button" href="/register">Подать заявку</a>
          <a className="button secondary" href="/login">Я уже клиент</a>
        </div>
      </div>

      <aside className="card grid">
        <h2>Как это работает</h2>
        <p>1. Регистрация по телефону и дате рождения.</p>
        <p>2. Мастер подтверждает клиента в админке.</p>
        <p>3. Клиент выбирает окно, заявка ждёт подтверждения.</p>
        <p>4. Пока заявка ждёт, время уже скрыто от остальных.</p>
        {whatsapp ? (
          <a className="button secondary" href={`https://wa.me/${whatsapp}`}>Написать в WhatsApp</a>
        ) : null}
      </aside>
    </section>
  );
}
