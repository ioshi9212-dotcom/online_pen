import { getClientCookie } from "@/lib/clientSession";
import { rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PricePage() {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
  });
  const mainServices = services.filter((service) => service.showInBooking);
  const addOns = services.filter((service) => !service.showInBooking);
  const inCabinet = Boolean(getClientCookie());

  return (
    <main className="client-v2 price-v2">
      <section className="price-v2-heading">
        <div><span className="client-v2-kicker">Прайс</span><h1>Услуги и цены</h1><p>Основные услуги бронируют время. Дополнения можно указать в комментарии к записи.</p></div>
        <a className="client-v2-button" href={inCabinet ? "/my#booking-flow" : "/login"}>{inCabinet ? "Выбрать время" : "Войти для записи"}</a>
      </section>

      {mainServices.length ? (
        <section className="price-v2-section">
          <h2>Основные услуги</h2>
          <div className="price-v2-grid">
            {mainServices.map((service) => (
              <article key={service.id}>
                <div><span>Запись</span><h3>{service.title}</h3><p>{service.description || "Основная услуга для записи."}</p></div>
                <footer><small>{service.durationMinutes} мин</small><b>{rub(service.price)}</b></footer>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {addOns.length ? (
        <section className="price-v2-section">
          <h2>Дополнительно</h2>
          <div className="price-v2-list">
            {addOns.map((service) => (
              <article key={service.id}>
                <div><b>{service.title}</b>{service.description ? <span>{service.description}</span> : null}</div>
                <strong>{rub(service.price)}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
