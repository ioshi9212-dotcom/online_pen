"use client";

import { usePathname, useSearchParams } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname.startsWith("/admin")) return null;

  const clientToken = searchParams.get("client") || "";
  const isClientArea = Boolean(clientToken);
  const homeHref = isClientArea ? `/my?client=${clientToken}` : "/";

  return (
    <>
      <header className="top-menu">
        <a className="brand" href={homeHref}>
          <span className="brand-icon">▣</span>
          <b>Онлайн-запись</b>
        </a>

        <nav className="menu-links" aria-label="Основное меню">
          {isClientArea ? (
            <>
              <a href={`/my?client=${clientToken}`}>Кабинет</a>
              <a href={`/my?client=${clientToken}#windows`}>Свободные окна</a>
              <a href={`/price?client=${clientToken}`}>Прайс</a>
              <a href={`/profile?client=${clientToken}`}>Профиль</a>
              <a className="primary-link" href={`/booking?client=${clientToken}`}>Выбрать время</a>
            </>
          ) : (
            <>
              <a href="/price">Прайс</a>
              <a href="/#how">Как записаться</a>
              <a href="/login">Войти</a>
              <a className="primary-link" href="/register">Записаться</a>
            </>
          )}
        </nav>
      </header>

      <a className="master-side-link" href="/admin" title="Вход мастера по паролю">Мастер</a>
    </>
  );
}
