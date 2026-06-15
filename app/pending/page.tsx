export default function PendingPage() {
  return (
    <section className="card auth-card">
      <p className="eyebrow">Заявка отправлена</p>
      <h1>Заявка у меня</h1>
      <p>Как подтвержу — откроется расписание. Пока можно выдохнуть. Это бесплатно.</p>
      <div className="notice">Свободные окна появятся после подтверждения доступа.</div>
      <div className="actions" style={{ marginTop: 16 }}>
        <a className="button secondary" href="/">На главную</a>
        <a className="quiet-link" href="/price">Прайс</a>
      </div>
    </section>
  );
}
