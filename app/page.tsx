import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const mainServices = services.filter((service) => service.showInBooking);
  const addOns = services.filter((service) => !service.showInBooking);

  return (
    <main className="page public-page">
      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>Запись открывается после подтверждения</h1>
        <p className="lead">Свободные окна видят только подтверждённые клиенты. Так расписание не превращается в витрину для любопытных прохожих.</p>
        <div className="actions">
          <a className="button" href="/login">Я уже зарегистрирована</a>
          <a className="button secondary" href="/register">Отправить заявку</a>
        </div>
      </section>

      <section className="card public-text-steps">
        <h2>Как получить доступ</h2>
        <div className="public-text-step-list">
          <div>
            <b>Я ещё не зарегистрирована</b>
            <p>Отправьте короткую заявку. После подтверждения мастера откроется личный кабинет.</p>
          </div>
          <div>
            <b>Я уже зарегистрирована</b>
            <p>Введите телефон и дату рождения. Если доступ открыт — попадёте в кабинет. Если заявка ждёт — увидите статус ожидания.</p>
          </div>
          <div>
            <b>Заявка уже отправлена</b>
            <p>Повторно регистрироваться не нужно. Войдите через “Я уже зарегистрирована” и проверьте статус.</p>
          </div>
        </div>
      </section>

      <section className="card public-price-info" id="price">
        <div className="section-head">
          <div>
            <h2>Прайс</h2>
            <p>Информация по услугам. Запись по времени доступна только после подтверждения клиента.</p>
          </div>
        </div>

        {mainServices.length ? (
          <div className="public-price-group">
            <h3>Основные услуги</h3>
            <div className="public-price-list">
              {mainServices.map((service) => (
                <article className="public-price-row" key={service.id}>
                  <div>
                    <b>{service.title}</b>
                    {service.description ? <p>{service.description}</p> : <p>{service.durationMinutes} мин</p>}
                  </div>
                  <strong>{rub(service.price)}</strong>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {addOns.length ? (
          <div className="public-price-group">
            <h3>Дополнительно</h3>
            <div className="public-price-list compact">
              {addOns.map((service) => (
                <article className="public-price-row" key={service.id}>
                  <div>
                    <b>{service.title}</b>
                    {service.description ? <p>{service.description}</p> : <p>Дополнительная позиция к основной услуге</p>}
                  </div>
                  <strong>{rub(service.price)}</strong>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {services.length === 0 ? <div className="empty-state">Прайс пока пуст.</div> : null}
      </section>
    </main>
  );
}
