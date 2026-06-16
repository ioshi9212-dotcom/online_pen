"use client";

import { useEffect, useState } from "react";

type CurrentUrl = { path: string; clientToken: string };

export default function SiteHeader() {
  const [current, setCurrent] = useState<CurrentUrl>({ path: "", clientToken: "" });

  useEffect(() => {
    const readUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setCurrent({ path: window.location.pathname, clientToken: params.get("client") || "" });
    };
    readUrl();
    window.addEventListener("popstate", readUrl);
    return () => window.removeEventListener("popstate", readUrl);
  }, []);

  if (current.path.startsWith("/admin")) return null;

  const token = current.clientToken;
  const isClient = Boolean(token);
  const brandHref = isClient ? `/my?client=${token}` : "/";

  return (
    <>
      <header className="top-menu">
        <a className="brand" href={brandHref}>
          <span className="brand-icon">▣</span>
          <b>Онлайн-запись</b>
        </a>
        <nav className="menu-links" aria-label="Основное меню">
          {isClient ? (
            <>
              <a href={`/my?client=${token}`}>Кабинет</a>
              <a href={`/my?client=${token}#windows`}>Окна</a>
              <a href={`/price?client=${token}`}>Прайс</a>
              <a href={`/profile?client=${token}`}>Профиль</a>
              <a className="primary-link" href={`/booking?client=${token}`}>Записаться</a>
            </>
          ) : (
            <>
              <a href="/price">Прайс</a>
              <a href="/#how">Как записаться</a>
              <a href="/login">Войти</a>
              <a className="primary-link" href="/login">Выбрать время</a>
            </>
          )}
        </nav>
      </header>
      <a className="master-side-link" href="/admin" title="Вход мастера по паролю">Мастер</a>
    </>
  );
}
