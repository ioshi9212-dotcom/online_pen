import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";
import { getClientCookie } from "@/lib/clientSession";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const savedClientToken = getClientCookie();
  if (savedClientToken) {
    const savedClient = await prisma.client.findUnique({ where: { publicToken: savedClientToken }, select: { status: true } });
    if (savedClient?.status === "APPROVED") redirect(`/my?client=${savedClientToken}`);
  }

  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const mainServices = services.filter((service) => service.showInBooking);
  const addOns = services.filter((service) => !service.showInBooking);

  return (
    <main className="page public-page">
      <section className="hero">
        <p className="muted">Онлайн-запись</p>
        <h1>Записаться онлайн</h1>
        <p className="lead">Уже были у меня? Войдите по телефону и дате рождения. Впервые? Отправьте заявку, и после подтверждения откроется запись.</p>
        <div className="actions">
          <a className="button" href="/login">Войти</a>
          <a className="button secondary" href="/register">Я новый клиент</a>
        </div>
      </section>

      <section className="public-text-steps">
        <h2>Как это работает</h2>
        <div className="public-text-step-list">
          <div>
            <b>Впервые у меня</b>
            <p>Заполните короткую форму. После подтверждения откроется личный кабинет и свободные окна.</p>
          </div>
          <div>
            <b>Уже мой клиент</b>
            <p>Войдите по телефону и дате рождения. Если заявка ещё ждёт подтверждения, покажем её статус.</p>
          </div>
          <div>
            <b>Заявка уже отправлена</b>
            <p>Повторно заполнять форму не нужно. Нажмите «Войти» и проверьте статус.</p>
          </div>
        </div>
      </section>

      <section className="card public-price-info" id="price">
        <div className="section-head">
          <div>
            <h2>Прайс</h2>
            <p>Услуги и стоимость. Выбрать время можно после подтверждения доступа.</p>
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
