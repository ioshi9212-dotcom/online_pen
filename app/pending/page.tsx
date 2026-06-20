type SearchParams = {
  phone?: string;
  already?: string;
};

const WHATSAPP_PHONE = "+7 950 296-60-69";
const WHATSAPP_LINK = "https://wa.me/79502966069";

export default function PendingPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const already = searchParams.already === "1";
  const phone = searchParams.phone;

  return (
    <main className="page pending-page">
      <section className="hero">
        <p className="eyebrow">{already ? "Заявка уже есть" : "Заявка отправлена"}</p>
        <h1>{already ? "Ожидайте подтверждения" : "Заявка у мастера"}</h1>
        <p>
          {already
            ? "Вы уже отправили заявку на регистрацию. Повторно отправлять её не нужно — мастер ещё не подтвердил доступ. Как только подтвердит, вы сможете войти и выбрать свободное окно."
            : "Как мастер подтвердит доступ, откроется личный кабинет со свободными окнами и записью."}
        </p>

        <div className="notice pending-notice">
          <b>Если нужно срочно — напишите в WhatsApp:</b>
          <a href={WHATSAPP_LINK}>{WHATSAPP_PHONE}</a>
          {phone ? <small>Телефон в заявке: {phone}</small> : null}
        </div>

        <div className="actions" style={{ marginTop: 16 }}>
          <a className="button secondary" href="/">На главную</a>
          <a className="button secondary" href="/price">Прайс</a>
          <a className="button" href={WHATSAPP_LINK}>Написать в WhatsApp</a>
        </div>
      </section>
    </main>
  );
}
