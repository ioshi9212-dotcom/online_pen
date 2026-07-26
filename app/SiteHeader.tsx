"use client";

import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  const inCabinet = pathname.startsWith("/my") || pathname.startsWith("/profile");
  const inPreview = pathname.startsWith("/preview");

  return (
    <header className="site-header-v2">
      <a className="site-header-v2-brand" href={inCabinet ? "/my" : "/"}>
        <img src="/icon.svg" alt="" />
        <span><b>Запись к мастеру</b><small>маникюр · педикюр</small></span>
      </a>

      {inPreview ? <span className="site-header-v2-preview">Превью дизайна</span> : null}

      <nav aria-label="Основное меню">
        {inCabinet ? (
          <>
            <a href="/my#booking-flow">Записаться</a>
            <a href="/profile">Профиль</a>
            <a className="site-header-v2-quiet" href="/logout">Выйти</a>
          </>
        ) : (
          <>
            <span>Уже есть доступ?</span>
            <a className="site-header-v2-login" href="/login">Войти</a>
          </>
        )}
      </nav>
    </header>
  );
}
