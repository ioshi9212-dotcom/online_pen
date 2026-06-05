import { createService, toggleService } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function ServicesPage() {
  if (!isAdmin()) redirect("/admin/login");
  const services = await prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });

  return (
    <section className="grid">
      <div className="card">
        <h1>Прайс</h1>
        <form action={createService} className="grid">
          <div className="grid-3">
            <label>Название<input name="title" required /></label>
            <label>Длительность, мин<input name="durationMinutes" type="number" defaultValue="150" required /></label>
            <label>Цена<input name="price" type="number" defaultValue="2500" required /></label>
          </div>
          <label>Описание<textarea name="description" /></label>
          <label>Порядок<input name="sortOrder" type="number" defaultValue="100" /></label>
          <button>Добавить услугу</button>
        </form>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Услуга</th><th>Длительность</th><th>Цена</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id}>
                <td>{service.title}<br /><span className="small">{service.description}</span></td>
                <td>{service.durationMinutes} мин</td>
                <td>{rub(service.price)}</td>
                <td>{service.isActive ? "Показывается" : "Скрыта"}</td>
                <td>
                  <form action={toggleService}>
                    <input type="hidden" name="id" value={service.id} />
                    <input type="hidden" name="active" value={String(!service.isActive)} />
                    <button className="secondary">{service.isActive ? "Скрыть" : "Показать"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
