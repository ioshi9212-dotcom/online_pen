import { isAdmin } from "@/lib/admin";
import { rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createService, deleteService, moveService, toggleService, updateService } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function param(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function AdminToast({ searchParams, serviceTitle }: { searchParams: SearchParams; serviceTitle: (id?: string) => string }) {
  const created = param(searchParams, "created");
  const updated = param(searchParams, "updated");
  const deleted = param(searchParams, "deleted");
  const archived = param(searchParams, "archived");
  const duplicate = param(searchParams, "duplicate");
  const toggled = param(searchParams, "toggled");
  const moved = param(searchParams, "moved");
  const error = param(searchParams, "error");

  let tone = "ok-notice";
  let text = "";

  if (created) text = `Добавила: ${serviceTitle(created)}. Без дублей и лишней трагедии.`;
  if (updated) text = `Сохранила: ${serviceTitle(updated)}.`;
  if (deleted) text = "Удалила услугу. Она больше не будет путаться под ногами.";
  if (archived) text = `У услуги ${serviceTitle(archived)} уже есть записи, поэтому я не удалила её, а скрыла.`;
  if (toggled) text = param(searchParams, "visible") === "true" ? `Вернула в прайс: ${serviceTitle(toggled)}.` : `Скрыла из прайса: ${serviceTitle(toggled)}.`;
  if (moved) text = `Передвинула: ${serviceTitle(moved)}.`;
  if (duplicate) {
    tone = "notice";
    text = `Такая услуга уже есть: ${serviceTitle(duplicate)}. Второй раз не добавляю — сайт теперь не размножает маникюр почкованием.`;
  }
  if (error === "empty-title") {
    tone = "danger-notice";
    text = "Название пустое. Услуга без имени — это уже почти философия, но в прайс её не ставим.";
  }
  if (error && !text) {
    tone = "danger-notice";
    text = "Не сохранилось. Проверь поля и попробуй ещё раз.";
  }

  if (!text) return null;
  return (
    <div className={`toast ${tone}`} role="status">
      <strong>{tone === "danger-notice" ? "Ошибка" : tone === "notice" ? "Внимание" : "Готово"}</strong>
      <span>{text}</span>
      <a href="/admin/services" aria-label="Закрыть сообщение">×</a>
    </div>
  );
}

function ServiceForm({ mode, service }: { mode: "create" | "edit"; service?: { id: string; title: string; description: string; durationMinutes: number; price: number; isActive: boolean } }) {
  const isEdit = mode === "edit";

  return (
    <form action={isEdit ? updateService : createService} className="modal-form grid">
      {isEdit ? <input type="hidden" name="id" value={service?.id} /> : null}
      <div className="grid-3">
        <label>
          Название
          <input name="title" required placeholder="Маникюр + покрытие" defaultValue={service?.title ?? ""} autoFocus />
        </label>
        <label>
          Длительность, мин
          <input name="durationMinutes" type="number" defaultValue={service?.durationMinutes ?? 120} min="1" required />
        </label>
        <label>
          Цена
          <input name="price" type="number" defaultValue={service?.price ?? 2200} min="0" required />
        </label>
      </div>
      <label>
        Описание
        <textarea name="description" defaultValue={service?.description ?? ""} placeholder="Например: снятие, маникюр, покрытие. Можно оставить пустым." />
      </label>
      {isEdit ? (
        <label className="inline-check service-visible-check">
          <input name="isActive" type="checkbox" defaultChecked={service?.isActive ?? true} />
          Показывать клиентам в прайсе и записи
        </label>
      ) : null}
      <div className="modal-actions">
        <a className="button secondary" href="/admin/services">Отмена</a>
        <button>{isEdit ? "Сохранить" : "Добавить услугу"}</button>
      </div>
    </form>
  );
}

function ServiceRow({ service }: { service: { id: string; title: string; description: string; durationMinutes: number; price: number; isActive: boolean } }) {
  return (
    <article className={`service-row ${service.isActive ? "" : "is-muted"}`}>
      <div className="service-main-info">
        <div className="service-title-line">
          <h3>{service.title}</h3>
          <span className={service.isActive ? "status ok-status" : "status"}>{service.isActive ? "В прайсе" : "Скрыта"}</span>
        </div>
        {service.description ? <p>{service.description}</p> : <p className="small">Описание не заполнено. Клиент увидит только название, цену и длительность.</p>}
        <div className="service-meta-row">
          <span className="pill">{service.durationMinutes} мин</span>
          <span className="pill strong-pill">{rub(service.price)}</span>
        </div>
      </div>

      <div className="service-actions-panel">
        <a className="button secondary" href={`/admin/services?edit=${service.id}`}>Редактировать</a>
        <form action={toggleService}>
          <input type="hidden" name="id" value={service.id} />
          <input type="hidden" name="next" value={service.isActive ? "false" : "true"} />
          <button className="secondary">{service.isActive ? "Скрыть" : "Показать"}</button>
        </form>
        <div className="service-move-actions">
          <form action={moveService}>
            <input type="hidden" name="id" value={service.id} />
            <input type="hidden" name="direction" value="up" />
            <button className="secondary" aria-label="Поднять выше">↑</button>
          </form>
          <form action={moveService}>
            <input type="hidden" name="id" value={service.id} />
            <input type="hidden" name="direction" value="down" />
            <button className="secondary" aria-label="Опустить ниже">↓</button>
          </form>
        </div>
        <details className="delete-details">
          <summary>Удалить</summary>
          <form action={deleteService}>
            <input type="hidden" name="id" value={service.id} />
            <p className="small">Если по услуге уже были записи, я просто скрою её, чтобы история не сломалась.</p>
            <button className="danger">Да, удалить</button>
          </form>
        </details>
      </div>
    </article>
  );
}

export default async function ServicesPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  if (!isAdmin()) redirect("/admin/login");

  const services = await prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const active = services.filter((service) => service.isActive);
  const hidden = services.filter((service) => !service.isActive);
  const editId = param(searchParams, "edit");
  const showAddModal = param(searchParams, "add") === "1";
  const editService = editId ? services.find((service) => service.id === editId) : undefined;
  const byId = new Map(services.map((service) => [service.id, service.title]));
  const serviceTitle = (id?: string) => (id ? byId.get(id) ?? "услуга" : "услуга");

  return (
    <section className="admin-services-page grid">
      <AdminToast searchParams={searchParams} serviceTitle={serviceTitle} />

      <div className="card service-hero-card">
        <div>
          <p className="eyebrow">Админка · прайс</p>
          <h1>Услуги без каши</h1>
          <p className="lead">Добавление теперь через отдельное окно, список компактный, а одинаковые названия больше не плодятся. Наконец-то сайт делает вид, что он взрослый.</p>
        </div>
        <div className="service-stats">
          <div><strong>{active.length}</strong><span>видно клиентам</span></div>
          <div><strong>{hidden.length}</strong><span>скрыто</span></div>
          <div><strong>{services.length}</strong><span>всего услуг</span></div>
        </div>
      </div>

      <div className="services-toolbar card compact-card">
        <div>
          <h2>Прайс</h2>
          <p>Основной порядок услуг меняется стрелками. Редактирование — в отдельном окне, без километров форм на странице.</p>
        </div>
        <a className="button" href="/admin/services?add=1">+ Добавить услугу</a>
      </div>

      {services.length === 0 ? (
        <div className="empty-state">
          <h3>Прайс пустой</h3>
          <p>Добавь первую услугу. Сайт обещает не делать вид, что это сложнее запуска ракеты.</p>
          <a className="button" href="/admin/services?add=1">Добавить услугу</a>
        </div>
      ) : null}

      {active.length > 0 ? (
        <div className="service-list-panel card">
          <div className="section-head">
            <div>
              <h2>Активные услуги</h2>
              <p>Их видят клиентки в прайсе и при записи.</p>
            </div>
          </div>
          <div className="service-row-list">
            {active.map((service) => <ServiceRow service={service} key={service.id} />)}
          </div>
        </div>
      ) : null}

      {hidden.length > 0 ? (
        <details className="card soft-details services-hidden-box">
          <summary>
            <div>
              <h2>Скрытые услуги</h2>
              <p>{hidden.length} шт. Клиентки их не видят.</p>
            </div>
            <span className="button secondary">Открыть</span>
          </summary>
          <div className="service-row-list hidden-list">
            {hidden.map((service) => <ServiceRow service={service} key={service.id} />)}
          </div>
        </details>
      ) : null}

      {showAddModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-service-title">
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Новая услуга</p>
                <h2 id="add-service-title">Добавить в прайс</h2>
              </div>
              <a href="/admin/services" className="modal-close" aria-label="Закрыть">×</a>
            </div>
            <ServiceForm mode="create" />
          </div>
        </div>
      ) : null}

      {editId && editService ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-service-title">
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Редактирование</p>
                <h2 id="edit-service-title">{editService.title}</h2>
              </div>
              <a href="/admin/services" className="modal-close" aria-label="Закрыть">×</a>
            </div>
            <ServiceForm mode="edit" service={editService} />
          </div>
        </div>
      ) : null}

      {editId && !editService ? (
        <div className="toast danger-notice" role="status">
          <strong>Не нашла</strong>
          <span>Этой услуги уже нет. Возможно, она была удалена.</span>
          <a href="/admin/services" aria-label="Закрыть сообщение">×</a>
        </div>
      ) : null}
    </section>
  );
}
