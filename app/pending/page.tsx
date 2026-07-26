type SearchParams = {
  phone?: string;
  already?: string;
};

const WHATSAPP_PHONE = "+7 950 296-60-69";
const WHATSAPP_LINK = "https://wa.me/79502966069";

export default function PendingPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  return (
    <main className="client-v2 auth-v2 pending-v2">
      <section className="auth-v2-card is-status">
        <span className="pending-v2-icon" aria-hidden="true">✓</span>
        <div className="auth-v2-heading">
          <span className="client-v2-kicker">Заявка на доступ отправлена</span>
          <h1>Ждём, когда мастер откроет расписание</h1>
          <p><b>Расписание сейчас не показывается — это нормально.</b> Это ещё не запись на услугу.</p>
        </div>

        <div className="client-v2-access-steps pending-v2-steps">
          <span className="is-done"><i>✓</i><b>Заявка отправлена</b><small>{searchParams.phone || "Ваш номер сохранён"}</small></span>
          <span className="is-current"><i>2</i><b>Мастер открывает доступ</b><small>Сейчас действие за мастером</small></span>
          <span><i>3</i><b>Вы выбираете время</b><small>После сообщения мастера</small></span>
        </div>

        <div className="pending-v2-message">
          <b>Как я узнаю?</b>
          <p>Мастер напишет вам в WhatsApp. После этого вернитесь сюда и войдите по телефону и дате рождения.</p>
        </div>

        <div className="pending-v2-actions">
          <a className="client-v2-button" href="/login">Проверить, открыт ли доступ</a>
          <a className="client-v2-button is-secondary" href={WHATSAPP_LINK}>Написать мастеру</a>
        </div>
        <small className="pending-v2-contact">{WHATSAPP_PHONE}</small>
      </section>
    </main>
  );
}
