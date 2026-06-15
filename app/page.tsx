export default function HomePage() {
  return (
    <main className="grid page-stack">
      <section className="hero-shell">
        <div className="hero-copy">
          <p className="eyebrow">Закрытая онлайн-запись</p>
          <h1>Маникюр без лишнего спектакля</h1>
          <p className="lead">
            Выбираешь окно, я подтверждаю. Без переписок на полдня и торжественной линейки вокруг кутикулы.
          </p>
          <div className="actions hero-actions">
            <a className="button" href="/register">Записаться</a>
            <a className="button secondary" href="/login">Я уже клиент</a>
            <a className="quiet-link" href="/price">Прайс</a>
          </div>
          <div className="hero-tags">
            <span className="tag">можно молчать</span>
            <span className="tag">можно без идеи</span>
            <span className="tag">дизайн без суда</span>
            <span className="tag">чисто и спокойно</span>
            <span className="tag">если планы умерли — перенеси</span>
          </div>
        </div>

        <div className="hero-panel">
          <div className="mini-card hero-note">
            <span className="pill">как это устроено</span>
            <h2>Сначала доступ, потом расписание.</h2>
            <p>
              Новые клиенты отправляют заявку. После подтверждения открываются реальные окна — только те, которые я вывела онлайн.
            </p>
          </div>
          <div className="mini-card hero-note muted-card">
            <span className="pill">без хаоса</span>
            <p>
              Сайт не показывает случайные времена “а вдруг получится”. Если окно видно — его можно запросить.
            </p>
          </div>
        </div>
      </section>

      <section className="card" id="how-it-works">
        <div className="section-head">
          <div>
            <p className="eyebrow">Маршрут клиента</p>
            <h2>Как это работает</h2>
          </div>
          <a className="button secondary" href="/register">Начать запись</a>
        </div>
        <div className="flow-steps">
          <div className="flow-step">
            <span>1</span>
            <b>Отправляешь заявку</b>
            <p>Я подтверждаю доступ. Расписание не болтается в открытом доступе.</p>
          </div>
          <div className="flow-step">
            <span>2</span>
            <b>Выбираешь услугу и окно</b>
            <p>Видны только открытые онлайн-окна. Никакой рулетки.</p>
          </div>
          <div className="flow-step">
            <span>3</span>
            <b>Я подтверждаю запись</b>
            <p>Заявка приходит мне. После подтверждения место закреплено.</p>
          </div>
          <div className="flow-step">
            <span>4</span>
            <b>Приходишь без лишнего шума</b>
            <p>Можно с идеей, можно без. Разберёмся на месте, не трагедия.</p>
          </div>
        </div>
      </section>

      <section className="grid-3">
        <div className="card compact-card">
          <span className="pill">для своих</span>
          <h3>Доступ после подтверждения</h3>
          <p>Сначала анкета, потом личный кабинет. Случайных кликов меньше, порядка больше.</p>
        </div>
        <div className="card compact-card">
          <span className="pill">по делу</span>
          <h3>Прайс без угадайки</h3>
          <p>Услуга, длительность, цена. Без “пишите в директ, расскажу тайну”.</p>
        </div>
        <div className="card compact-card">
          <span className="pill">если мест нет</span>
          <h3>Лист ожидания</h3>
          <p>Можно оставить пожелания. Если окно освободится — я увижу заявку.</p>
        </div>
      </section>
    </main>
  );
}
