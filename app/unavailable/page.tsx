export default function UnavailablePage() {
  const whatsapp = process.env.NEXT_PUBLIC_MASTER_WHATSAPP;
  return (
    <section className="card">
      <h1>Запись сейчас недоступна</h1>
      <p>Пока свободных мест не отображается. Попробуйте позже или напишите мастеру для уточнения.</p>
      {whatsapp ? <a className="button" href={`https://wa.me/${whatsapp}`}>Написать в WhatsApp</a> : null}
    </section>
  );
}
