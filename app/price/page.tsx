import { prisma } from "@/lib/prisma";
import { rub } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = { client?: string };

export default async function PricePage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const token = searchParams.client;

  return (
    <main className="client-shell client-simple-page">
      <header className="client-topbar">
        <a className="client-logo" href={token ? `/my?client=${token}` : "/"}><span>O</span><b>Онлайн-запись</b></a>
        <nav>
          {token ? <a href={`/my?client=${token}`}>Кабинет</a> : <a href="/register">Записаться</a>}
          {token ? <a href={`/my?client=${token}#windows`}>Окна</a> : <a href="/login">Вход</a>}
          {token ? <a href={`/profile?client=${token}`}>Профиль</a> : null}
        </nav>
        <div className="client-mini-avatar">₽</div>
      </header>

      <section className="client-welcome">
        <div>
          <p className="client-eyebrow">Прайс</p>
          <h1>Услуги и цены</h1>
          <p>Выберите услугу, а потом удобное окно. Сложные идеи лучше написать в комментарии при записи.</p>
        </div>
      </section>

      <section className="client-card">
        {services.length ? (
          <div className="client-price-grid">
            {services.map((service) => (
              <article className="client-price-card" key={service.id}>
                <div>
                  <h2>{service.title}</h2>
                  <p>{service.description || "Описание можно добавить позже."}</p>
                </div>
                <div className="client-price-meta">
                  <span>{service.durationMinutes} мин</span>
                  <b>{rub(service.price)}</b>
                </div>
                {token ? <a className="client-button" href={`/booking?client=${token}&service=${service.id}`}>Выбрать</a> : <a className="client-button secondary" href="/register">Записаться</a>}
              </article>
            ))}
          </div>
        ) : (
          <div className="client-empty">Прайс пока пуст.</div>
        )}
      </section>
    </main>
  );
}
