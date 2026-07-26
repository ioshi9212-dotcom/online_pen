import { getClientCookie } from "@/lib/clientSession";
import { rub } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const savedClientToken = getClientCookie();
  if (savedClientToken) {
    const savedClient = await prisma.client.findUnique({
      where: { publicToken: savedClientToken },
      select: { status: true }
    });
    if (savedClient?.status === "APPROVED") redirect("/my");
  }

  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
  });
  const mainServices = services.filter((service) => service.showInBooking);

  return (
    <main className="client-v2 public-v2">
      <section className="public-v2-hero">
        <div className="public-v2-copy">
          <span className="client-v2-kicker">Онлайн-запись</span>
          <h1>Удобное время — без переписки туда-сюда</h1>
          <p>Расписание открывается постоянным клиентам после короткой проверки мастером.</p>
          <div className="public-v2-actions">
            <a className="client-v2-button" href="/register">Запросить доступ</a>
            <a className="client-v2-button is-secondary" href="/login">У меня уже есть доступ</a>
          </div>
          <small>Запрос доступа — это ещё не запись на услугу.</small>
        </div>

        <div className="public-v2-visual" aria-hidden="true">
          <span className="public-v2-polish" />
          <div className="public-v2-phone">
            <small>Ближайшее окно</small>
            <b>Четверг, 14:30</b>
            <span>Маникюр · 2 часа</span>
            <i>Выбрать время</i>
          </div>
        </div>
      </section>

      <section className="public-v2-how">
        <div className="public-v2-section-heading">
          <span className="client-v2-kicker">Как это работает</span>
          <h2>Три понятных шага</h2>
        </div>
        <div className="client-v2-access-steps">
          <span><i>1</i><b>Отправьте заявку</b><small>Имя, телефон и дата рождения</small></span>
          <span><i>2</i><b>Мастер откроет доступ</b><small>Вы получите сообщение</small></span>
          <span><i>3</i><b>Выберите время</b><small>Только реально свободные окна</small></span>
        </div>
      </section>

      {mainServices.length ? (
        <section className="public-v2-price">
          <div className="public-v2-section-heading">
            <span className="client-v2-kicker">Прайс</span>
            <h2>Основные услуги</h2>
          </div>
          <div className="public-v2-price-list">
            {mainServices.slice(0, 6).map((service) => (
              <article key={service.id}>
                <div>
                  <b>{service.title}</b>
                  <span>{service.description || `${service.durationMinutes} мин`}</span>
                </div>
                <strong>{rub(service.price)}</strong>
              </article>
            ))}
          </div>
          <a className="client-v2-text-link" href="/price">Посмотреть весь прайс →</a>
        </section>
      ) : null}

      <footer className="public-v2-footer">
        <span>Онлайн-запись работает в тестовом режиме.</span>
        <a href="/admin">Вход для мастера</a>
      </footer>
    </main>
  );
}
