import { isAdmin } from "@/lib/admin";
import { rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createService, moveService, updateService } from "./actions";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  if (!isAdmin()) redirect("/admin/login");
  const services = await prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });

  return (
    <section className="grid">
      <div className="card">
        <h1>Редактировать прайс</h1>
        <p>Добавляй услуги, меняй цену, длительность и видимость. Поле “порядок” убрано — новые услуги будут вставать ниже, а потом можно двигать их кнопками.</p>
        <form action={createService} className="grid">
          <div className="grid-3">
            <label>Название услуги<input name="title" required placeholder="Маникюр" /></label>
            <label>Длительность, мин<input name="durationMinutes" type="number" defaultValue="120" min="1" required /></label>
            <label>Цена<input name="price" type="number" defaultValue="2200" min="0" required /></label>
          </div>
          <label>Описание<textarea name="description" placeholder="Можно оставить пустым" /></label>
          <button>Добавить услугу</button>
        </form>
      </div>

      <div className="card">
        <h2>Услуги в прайсе</h2>
        {services.length === 0 ? <div className="notice">Услуг пока нет.</div> : null}
        <div className="grid">
          {services.map((service) => (
            <div className="mini-card" key={service.id}>
              <form action={updateService} className="grid">
                <input type="hidden" name="id" value={service.id} />
                <div className="grid-3">
                  <label>Название<input name="title" defaultValue={service.title} required /></label>
                  <label>Длительность, мин<input name="durationMinutes" type="number" min="1" defaultValue={service.durationMinutes} required /></label>
                  <label>Цена<input name="price" type="number" min="0" defaultValue={service.price} required /></label>
                </div>
                <label>Описание<textarea name="description" defaultValue={service.description} /></label>
                <label className="inline-check">
                  <input name="isActive" type="checkbox" defaultChecked={service.isActive} />
                  Показывать клиентам в прайсе и записи
                </label>
                <div className="actions">
                  <button className="ok">Сохранить изменения</button>
                  <span className="status">{service.isActive ? "Показывается" : "Скрыта"}</span>
                  <span className="small">{service.durationMinutes} мин · {rub(service.price)}</span>
                </div>
              </form>

              <div className="actions">
                <form action={moveService}>
                  <input type="hidden" name="id" value={service.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button className="secondary">↑ Выше</button>
                </form>
                <form action={moveService}>
                  <input type="hidden" name="id" value={service.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button className="secondary">↓ Ниже</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
