export default function UnavailablePage() {
  return (
    <main className="client-v2 auth-v2">
      <section className="auth-v2-card is-compact">
        <div className="auth-v2-heading">
          <span className="client-v2-kicker">Доступ закрыт</span>
          <h1>Расписание пока недоступно</h1>
          <p>Возможно, мастер ещё не открыл доступ или ограничил его. Если вы уверены, что это ошибка, напишите мастеру.</p>
        </div>
        <div className="public-v2-actions">
          <a className="client-v2-button" href="/login">Проверить ещё раз</a>
          <a className="client-v2-button is-secondary" href="/">На главную</a>
        </div>
      </section>
    </main>
  );
}
