import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";

export default async function PricePage() {
  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  return (
    <section className="card">
      <h1>Прайс</h1>
      <div className="grid">
        {services.map((service) => (
          <div className="card" key={service.id}>
            <h3>{service.title}</h3>
            <p>{service.description || "Описание можно добавить в админке."}</p>
            <div className="actions">
              <span className="pill">{service.durationMinutes} мин</span>
              <span className="pill">{rub(service.price)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
