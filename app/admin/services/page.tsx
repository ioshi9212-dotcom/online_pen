import { isAdmin } from "@/lib/admin";
import { DURATION_OPTIONS, durationLabel } from "@/lib/durations";
import { rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createService, deleteService, moveService, toggleBookingService, toggleService, updateService } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ServiceLite = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  showInBooking: boolean;
};

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
  const booking = param(searchParams, "booking");
  const moved = param(searchParams, "moved");
  const error = param(searchParams, "error");

  let tone = "ok-notice";
  let text = "";

  if (created) text = `Добавила: ${serviceTitle(created)}.`;
  if (updated) text = `Сохранила: ${serviceTitle(updated)}.`;
  if (deleted) text = "Удалила услугу.";
  if (archived) text = `У услуги ${serviceTitle(archived)} уже есть записи, поэтому я не удалила её, а скрыла.`;
  if (toggled) text = param(searchParams, "visible") === "true" ? `Вернула в прайс: ${serviceTitle(toggled)}.` : `Скрыла из прайса: ${serviceTitle(toggled)}.`;
  if (booking) text = param(searchParams, "visible") === "true" ? `Теперь можно выбирать при записи: ${serviceTitle(booking)}.` : `Убрала из выбора при записи: ${serviceTitle(booking)}.`;
  if (moved) text = `Передвинула: ${serviceTitle(moved)}.`;
  if (duplicate) {
    tone = "notice";
    text = `Такая позиция уже есть: ${serviceTitle(duplicate)}. Второй раз не добавляю.`;
  }
  if (error === "empty-title") {
    tone = "danger-notice";
    text = "Название пустое. В прайс позицию без имени не ставим.";
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

function DurationSelect({ defaultValue }: { defaultValue: number }) {
  return (
    <select name="durationMinutes" defaultValue={String(defaultValue)} required>
      {DURATION_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function ServiceForm({ mode, service }: { mode: "create" | "edit"; service?: ServiceLite }) {
  const isEdit = mode === "edit";

  return (
    <form action={isEdit ? updateService : createService} className="modal-form grid">
      {isEdit ? <input type="hidden" name="id" value={service?.id} /> : null}
      <div className="grid-3">
        <label>
          Название
          <input name="title" required placeholder="Маникюр" defaultValue={service?.title ?? ""} autoFocus />
        </label>
        <label>
          Длительность
          <DurationSelect defaultValue={service?.durationMinutes ?? 120} />
        </label>
        <label>
          Цена
          <input name="price" type="number" defaultValue={service?.price ?? 2000} min="0" required />
        </label>
      </div>
      <label>
        Описание
        <textarea name="description" defaultValue={service?.description ?? ""} placeholder="Например: снятие, маникюр, покрытие. Для допов можно написать: добавляется к основной услуге." />
      </label>
      <div className="service-visibility-box">
        <label className="inline-check service-visible-check">
          <input name="isActive" type="checkbox" defaultChecked={service?.isActive ?? true} />
          Показывать в прайсе
        </label>
        <p>Это видит клиент в разделе “Прайс”: основные услуги, допы, дизайн, френч, ремонт.</p>
        <label className="inline-check service-visible-check">
          <input name="showInBooking" type="checkbox" defaultChecked={service?.showInBooking ?? true} />
          Можно выбрать при записи
        </label>
        <p>Включайте только для основных услуг, под которые реально бронируется отдельное окно. Френч/дизайн можно оставить только в прайсе.</p>
      </div>
      <div className="modal-actions">
        <a className="button secondary" href="/admin/services">Отмена</a>
        <button>{isEdit ? "Сохранить" : "Добавить позицию"}</button>
      </div>
    </form>
  );
}

function ServiceRow({ service }: { service: ServiceLite }) {
  return (
    <article className={`service-row ${service.isActive ? "" : "is-muted"}`}>
      <div className="service-main-info">
        <div className="service-title-line">
          <h3>{service.title}</h3>
          <div className="service-statuses">
            <span className={service.isActive ? "status ok-status" : "status"}>{service.isActive ? "В прайсе" : "Скрыта"}</span>
            {service.isActive ? <span className={service.showInBooking ? "status ok-status" : "status wait"}>{service.showInBooking ? "Можно записаться" : "Только прайс"}</span> : null}
          </div>
        </div>
        {service.description ? <p>{service.description}</p> : <p className="small">Описание не заполнено. Клиент увидит название, цену и длительность.</p>}
        <div className="service-meta-row">
          <span className="pill">{durationLabel(service.durationMinutes)}</span>
          <span className="pill strong-pill">{rub(service.price)}</span>
        </div>
      </div>

      <div className="service-actions-panel">
        <a className="button secondary" href={`/admin/services?edit=${service.id}`}>Редактировать</a>
        <form action={toggleBookingService}>
          <input type="hidden" name="id" value={service.id} />
          <input type="hidden" name="next" value={service.showInBooking ? "false" : "true"} />
          <button className="secondary" disabled={!service.isActive}>{service.showInBooking ? "Убрать из записи" : "Включить в запись"}</button>
        </form>
        <form action={toggleService}>
          <input type="hidden" name="id" value={service.id} />
          <input type="hidden" name="next" value={service.isActive ? "false" : "true"} />
          <button className="secondary">{service.isActive ? "Скрыть из прайса" : "Показать в прайсе"}</button>
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
            <p className="small">Если по позиции уже были записи, я просто скрою её, чтобы история не сломалась.</p>
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
  const priceVisible = services.filter((service) => service.isActive);
  const bookingVisible = services.filter((service) => service.isActive && service.showInBooking);
  const priceOnly = services.filter((service) => service.isActive && !service.showInBooking);
  const hidden = services.filter((service) => !service.isActive);
  const editId = param(searchParams, "edit");
  const showAddModal = param(searchParams, "add") === "1";
  const editService = editId ? services.find((service) => service.id === editId) : undefined;
  const byId = new Map<string, string>(services.map((service) => [service.id, service.title]));
  const serviceTitle = (id?: string) => (id ? byId.get(id) ?? "позиция" : "позиция");

  return (
    <section className="admin-services-page grid">
      <AdminToast searchParams={searchParams} serviceTitle={serviceTitle} />

      <div className="card service-hero-card">
        <div>
          <p className="eyebrow">Админка · прайс</p>
          <h1>Прайс и услуги для записи</h1>
          <p className="lead">Прайс может содержать всё: маникюр, френч, дизайн, ремонт. А при записи показываем только основные услуги, под которые нужно отдельное окно.</p>
        </div>
        <div className="service-stats">
          <div><strong>{priceVisible.length}</strong><span>в прайсе</span></div>
          <div><strong>{bookingVisible.length}</strong><span>можно выбрать</span></div>
          <div><strong>{priceOnly.length}</strong><span>только прайс</span></div>
        </div>
      </div>

      <div className="services-toolbar card compact-card">
        <div>
          <h2>Позиции прайса</h2>
          <p>Например: “Маникюр — 2000 ₽” включаем в запись, а “Френч — 200 ₽” оставляем только в прайсе.</p>
        </div>
        <div className="actions">
          <a className="button secondary" href="/admin">Админка</a>
          <a className="button" href="/admin/services?add=1">+ Добавить позицию</a>
        </div>
      </div>

      {services.length === 0 ? (
        <div className="empty-state">
          <h3>Прайс пустой</h3>
          <p>Добавь первую позицию.</p>
          <div className="actions">
            <a className="button secondary" href="/admin">Админка</a>
            <a className="button" href="/admin/services?add=1">Добавить позицию</a>
          </div>
        </div>
      ) : null}

      {bookingVisible.length > 0 ? (
        <div className="service-list-panel card">
          <div className="section-head">
            <div>
              <h2>Можно выбрать при записи</h2>
              <p>Только эти услуги клиент видит в форме записи.</p>
            </div>
          </div>
          <div className="service-row-list">
            {bookingVisible.map((service) => <ServiceRow service={service} key={service.id} />)}
          </div>
        </div>
      ) : null}

      {priceOnly.length > 0 ? (
        <div className="service-list-panel card">
          <div className="section-head">
            <div>
              <h2>Только в прайсе</h2>
              <p>Клиенты видят эти позиции в прайсе, но не могут выбрать их как отдельную запись.</p>
            </div>
          </div>
          <div className="service-row-list">
            {priceOnly.map((service) => <ServiceRow service={service} key={service.id} />)}
          </div>
        </div>
      ) : null}

      {hidden.length > 0 ? (
        <details className="card soft-details services-hidden-box">
          <summary>
            <div>
              <h2>Скрытые позиции</h2>
              <p>{hidden.length} шт. Клиенты их не видят.</p>
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
                <p className="eyebrow">Новая позиция</p>
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
          <span>Этой позиции уже нет. Возможно, она была удалена.</span>
          <a href="/admin/services" aria-label="Закрыть сообщение">×</a>
        </div>
      ) : null}
    </section>
  );
}
