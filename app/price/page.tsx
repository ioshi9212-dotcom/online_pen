import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PricePage({ searchParams = {} }: { searchParams?: { client?: string } }) {
  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const token = searchParams.client;

  return (
    <main className="price-page">
      <section className="hero">
        <h1>Прайс</h1>
        <p>Выберите услугу и перейдите к записи.</p>
      </section>
      <section className="price-grid">
        {services.map((service) => (
          <article className="price-card" key={service.id}>
            <h2>{service.title}</h2>
            <p>{service.description || "Описание услуги."}</p>
            <p><b>{rub(service.price)}</b> · {service.durationMinutes} мин</p>
            {token ? <a className="button" href={`/booking?client=${token}&service=${service.id}`}>Выбрать</a> : <a className="button secondary" href="/register">Записаться</a>}
          </article>
        ))}
        {services.length === 0 ? <div className="notice">Прайс пока пуст.</div> : null}
      </section>
    </main>
  );
}
