import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PricePage() {
  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  return (
    <main className="grid page-stack">
      <section className="card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Прайс</p>
            <h1>Цены без квеста</h1>
            <p>Услуга, примерное время и цена. Сложные идеи лучше уточнить в комментарии при записи.</p>
          </div>
          <div className="actions">
            <a className="button" href="/register">Записаться</a>
            <a className="button secondary" href="/login">Я уже клиент</a>
          </div>
        </div>
      </section>

      <section className="service-list price-list">
        {services.length ? services.map((service) => (
          <article className="card service-price-card" key={service.id}>
            <div>
              <h3>{service.title}</h3>
              <p>{service.description || "Описание можно добавить в админке."}</p>
            </div>
            <div className="actions">
              <span className="pill">{service.durationMinutes} мин</span>
              <span className="pill strong-pill">{rub(service.price)}</span>
            </div>
          </article>
        )) : <div className="card notice">Прайс пока пуст. Неловко, но поправимо в админке.</div>}
      </section>
    </main>
  );
}
