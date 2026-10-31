import { getMasterProfile } from "@/lib/masterProfile";
type SearchParams = {
  phone?: string;
  already?: string;
};


export default async function PendingPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<SearchParams> }) {
  const searchParams = (await searchParamsPromise) || {};

  const master = await getMasterProfile();
  const already = searchParams.already === "1";
  const phone = "";

  return (
    <main className="page pending-page">
      <section className="hero">
        <p className="eyebrow">{already ? "Заявка уже есть" : "Заявка отправлена"}</p>
        <h1>{already ? "Ожидайте подтверждения" : "Заявка у мастера"}</h1>
        <p>
          {already
            ? "Заявка уже у мастера. После подтверждения войдите в кабинет и выберите время."
            : "После подтверждения мастера войдите в кабинет и выберите время."}
        </p>

        {master.whatsapp ? <div className="notice pending-notice">
          <b>Если нужно срочно — напишите в WhatsApp:</b>
          <a href={master.whatsapp}>{master.phone}</a>
          {phone ? <small>Телефон в заявке: {phone}</small> : null}
        </div> : null}

        <div className="actions" style={{ marginTop: 16 }}>
          <a className="button secondary" href="/">На главную</a>
          <a className="button secondary" href="/price">Прайс</a>
          <a className="button" href="/login">Проверить статус заявки</a>
        </div>
      </section>
    </main>
  );
}
