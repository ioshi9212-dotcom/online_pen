export default function PendingPage() {
  return (
    <section className="card">
      <h1>Заявка отправлена</h1>
      <p>Анкета ожидает подтверждения мастером. После подтверждения вам откроется расписание.</p>
      <div className="notice">Пока свободные места не отображаются. Попробуйте позже или напишите мастеру в WhatsApp.</div>
      <div className="actions" style={{ marginTop: 16 }}>
        <a className="button secondary" href="/">На главную</a>
      </div>
    </section>
  );
}
