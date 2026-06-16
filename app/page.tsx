export default function HomePage() {
  const days = Array.from({ length: 35 }, (_, i) => i + 1);
  const slots = [
    ["10:00", "Занято", "busy"],
    ["11:00", "Занято", "busy"],
    ["12:00", "Занято", "busy"],
    ["13:00", "Занято", "busy"],
    ["14:00", "Свободно", "free"],
    ["15:00", "Занято", "busy"],
    ["16:00", "Занято", "busy"],
    ["17:00", "Занято", "busy"],
    ["18:00", "Занято", "busy"]
  ];

  return (
    <main className="page">
      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>Свободные окна и запись</h1>
        <p className="lead">Выберите дату, время и отправьте заявку.</p>
      </section>

      <section className="info-cards">
        <article className="info-card">
          <h3>Свободные окна</h3>
          <p>Показываем только актуальные свободные даты и время.</p>
          <a className="button" href="/register">Выбрать время</a>
        </article>
        <article className="info-card">
          <h3>Как записаться</h3>
          <p>Выберите услугу, дату и время, отправьте заявку.</p>
          <a className="button secondary" href="#how">Подробнее</a>
        </article>
        <article className="info-card">
          <h3>Лист ожидания</h3>
          <p>Если всё занято — можно оставить пожелания.</p>
          <a className="button secondary" href="/login">Войти</a>
        </article>
      </section>

      <section className="calendar-layout">
        <article className="calendar-card">
          <h2>Ближайшие свободные даты</h2>
          <div className="actions" style={{ justifyContent: "space-between", marginTop: 12 }}>
            <button className="secondary">‹</button><b>Июнь 2026</b><button className="secondary">›</button>
          </div>
          <div className="calendar-head">{["ПН","ВТ","СР","ЧТ","ПТ","СБ","ВС"].map(d => <span key={d}>{d}</span>)}</div>
          <div className="calendar-grid">
            {days.map((day) => <a key={day} className={day === 17 ? "day-btn active" : "day-btn"} href="/register"><span>{day}</span>{[17,18,19,21,24,27].includes(day) ? <i className="dot" /> : null}</a>)}
          </div>
        </article>

        <article className="selected-day-card card">
          <p className="muted">Выбранная дата</p>
          <h2>17 июня, вторник</h2>
          <p>3 занято · 1 свободно</p>
          <div className="time-grid">
            {slots.map(([time, label, kind]) => <a key={time} className={`time-btn ${kind}`} href={kind === "free" ? "/register" : "#"}><b>{time}</b><span>{label}</span></a>)}
          </div>
        </article>
      </section>

      <section className="top-split" id="how">
        <article className="card">
          <h2>Пошагово</h2>
          <div className="steps">
            <div className="step"><span className="step-number">1</span><b>Выберите услугу</b><p>Из прайса.</p></div>
            <div className="step"><span className="step-number">2</span><b>Выберите дату и время</b><p>Только свободные окна.</p></div>
            <div className="step"><span className="step-number">3</span><b>Отправьте заявку</b><p>Место закрепится за вами.</p></div>
          </div>
        </article>
        <article className="card">
          <h2>Прайс</h2>
          <p>Маникюр — 1500 ₽</p>
          <p>Маникюр + покрытие — 2000 ₽</p>
          <a className="button secondary" href="/price">Весь прайс</a>
        </article>
      </section>

      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div><h2>Нет подходящего времени?</h2><p>Войдите в кабинет и встаньте в лист ожидания.</p></div>
          <a className="button" href="/login">Войти</a>
        </div>
      </section>
    </main>
  );
}
