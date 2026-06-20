export default function HomePage() {
  return (
    <main className="page public-page">
      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>Запись открывается после подтверждения</h1>
        <p className="lead">Свободные окна видят только подтверждённые клиенты. Так расписание не превращается в витрину для любопытных прохожих.</p>
        <div className="actions">
          <a className="button" href="/login">Я уже зарегистрирован</a>
          <a className="button secondary" href="/register">Отправить заявку</a>
        </div>
      </section>

      <section className="info-cards">
        <article className="info-card">
          <h3>Новый клиент</h3>
          <p>Сначала отправьте короткую заявку. После подтверждения мастера откроется личный кабинет.</p>
          <a className="button secondary" href="/register">Отправить заявку</a>
        </article>

        <article className="info-card">
          <h3>Уже зарегистрирован</h3>
          <p>Введите телефон и дату рождения. Если мастер уже подтвердил — откроется кабинет. Если заявка ещё ждёт — покажем статус ожидания.</p>
          <a className="button" href="/login">Войти / проверить статус</a>
        </article>

        <article className="info-card">
          <h3>Заявка уже отправлена?</h3>
          <p>Не заполняйте регистрацию заново. Нажмите “Я уже зарегистрирован” и войдите по тем же данным.</p>
          <a className="button secondary" href="/login">Проверить заявку</a>
        </article>
      </section>

      <section className="card public-closed-card">
        <div>
          <h2>Свободные окна скрыты</h2>
          <p>После входа подтверждённого клиента здесь будет личный кабинет: календарь, время, запись, статус заявки и лист ожидания.</p>
        </div>
        <div className="actions">
          <a className="button" href="/login">Я уже зарегистрирован</a>
          <a className="button secondary" href="/register">Отправить заявку</a>
        </div>
      </section>

      <section className="top-split" id="how">
        <article className="card">
          <h2>Как это работает</h2>
          <div className="steps">
            <div className="step"><span className="step-number">1</span><b>Заявка</b><p>Новый клиент оставляет имя, телефон и дату рождения.</p></div>
            <div className="step"><span className="step-number">2</span><b>Ожидание</b><p>Если заявка уже отправлена, повторно регистрироваться не нужно.</p></div>
            <div className="step"><span className="step-number">3</span><b>Подтверждение</b><p>После одобрения мастера открываются реальные свободные окна.</p></div>
          </div>
        </article>

        <article className="card">
          <h2>Прайс</h2>
          <p>Прайс можно посмотреть без входа, а выбрать время — только после подтверждения.</p>
          <a className="button secondary" href="/price">Открыть прайс</a>
        </article>
      </section>
    </main>
  );
}
