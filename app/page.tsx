export default function HomePage() {
  return (
    <main className="grid">
      <section className="hero">
        <div className="card">
          <h1>Ногти без салонной стерильности.</h1>
          <p className="lead">
            Тут можно прийти за нюдом, бабочками, корейским сиянием, хромом,
            странной идеей из Pinterest или дизайном “не спрашивай, просто делай”.
          </p>
          <div className="actions">
            <a className="button" href="/register">Записаться</a>
            <a className="button secondary" href="/login">Я уже клиент</a>
            <a className="button secondary" href="/price">Посмотреть прайс</a>
          </div>
          <div className="hero-tags">
            <span className="tag">блёстки на столе</span>
            <span className="tag">дизайны без осуждения</span>
            <span className="tag">можно молчать</span>
            <span className="tag">можно говорить без остановки</span>
            <span className="tag">можно с кофе и сериалом</span>
          </div>
        </div>

        <div className="card">
          <h2>Как это работает</h2>
          <p>
            Регистрируешься, я подтверждаю доступ, потом открывается расписание
            и свободные окна. Запись уходит мне на подтверждение.
          </p>
          <p>
            Если мест нет — можно зайти в лист ожидания. Если планы развалились —
            бывает, жизнь такая. Просто не пропадай молча.
          </p>
        </div>
      </section>

      <section className="grid-3">
        <div className="card">
          <h3>Для своих</h3>
          <p>Расписание не для случайных прохожих. Сначала заявка, потом доступ.</p>
        </div>
        <div className="card">
          <h3>Любые идеи</h3>
          <p>От спокойного нюда до максимально дерзких дизайнов. Без “а можно так?”. Можно.</p>
        </div>
        <div className="card">
          <h3>Живой формат</h3>
          <p>Сериал, разговоры, тишина, переносы и нормальная человеческая атмосфера.</p>
        </div>
      </section>
    </main>
  );
}
