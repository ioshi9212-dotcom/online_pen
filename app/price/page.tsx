import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PricePage({ searchParams = {} }: { searchParams?: { client?: string } }) {
  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const mainServices = services.filter((service) => service.showInBooking);
  const priceOnly = services.filter((service) => !service.showInBooking);
  const token = searchParams.client;

  return (
    <main className="price-page page">
      <section className="hero price-hero">
        <p className="muted">Прайс</p>
        <h1>Услуги и цены</h1>
        <p className="lead">Основные услуги можно выбрать при записи. Допы видны в прайсе, но не бронируются как отдельное окно.</p>
        <div className="actions">
          {token ? <a className="button" href={`/my?client=${token}#windows`}>К свободным окнам</a> : <a className="button" href="/login">Войти для записи</a>}
          <a className="button secondary" href={token ? `/my?client=${token}` : "/"}>Назад</a>
        </div>
      </section>

      {mainServices.length ? (
        <section className="price-section card">
          <div className="section-head">
            <div>
              <h2>Основные услуги</h2>
              <p>Их можно выбрать как отдельную запись.</p>
            </div>
          </div>
          <div className="pretty-price-grid">
            {mainServices.map((service) => (
              <article className="pretty-price-card main-price-card" key={service.id}>
                <div>
                  <span className="price-label">Запись</span>
                  <h3>{service.title}</h3>
                  <p>{service.description || "Основная услуга для записи."}</p>
                </div>
                <div className="pretty-price-bottom">
                  <span>{service.durationMinutes} мин</span>
                  <b>{rub(service.price)}</b>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {priceOnly.length ? (
        <section className="price-section card">
          <div className="section-head">
            <div>
              <h2>Дополнительно</h2>
              <p>Эти позиции можно добавить к основной услуге по согласованию с мастером.</p>
            </div>
          </div>
          <div className="pretty-addon-list">
            {priceOnly.map((service) => (
              <article className="pretty-addon-row" key={service.id}>
                <div>
                  <h3>{service.title}</h3>
                  {service.description ? <p>{service.description}</p> : <p>Дополнительная позиция в прайсе.</p>}
                </div>
                <div>
                  <span>{service.durationMinutes} мин</span>
                  <b>{rub(service.price)}</b>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {services.length === 0 ? <div className="notice">Прайс пока пуст.</div> : null}
    </main>
  );
}
