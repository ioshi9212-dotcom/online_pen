export default function UnavailablePage() {
  return (
    <main className="auth-page">
      <section className="card auth-card">
        <p className="eyebrow">Доступ закрыт</p>
        <h1>Расписание не открылось</h1>
        <p>Похоже, заявка ещё не подтверждена или доступ ограничен.</p>
        <div className="notice danger-notice">Если это ошибка — напишите мастеру напрямую.</div>
        <div className="actions" style={{ marginTop: 16 }}>
          <a className="button secondary" href="/login">Попробовать вход</a>
          <a className="quiet-link" href="/">На главную</a>
        </div>
      </section>
    </main>
  );
}
