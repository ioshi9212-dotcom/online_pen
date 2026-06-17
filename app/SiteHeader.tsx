"use client";

import { usePathname, useSearchParams } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname.startsWith("/admin")) return null;

  const clientToken = searchParams.get("client") || "";
  const windowsHref = clientToken ? `/my?client=${clientToken}#windows` : "/login";
  const profileHref = clientToken ? `/profile?client=${clientToken}` : "/login";
  const homeHref = clientToken ? `/my?client=${clientToken}` : "/";

  return (
    <header className="top-menu compact-client-menu">
      <a className="brand" href={homeHref}>
        <span className="brand-icon">▣</span>
        <b>Онлайн-запись</b>
      </a>

      <nav className="menu-links compact-client-links" aria-label="Основное меню">
        <a href={windowsHref}>Свободные окна</a>
        <a href={profileHref}>Профиль</a>
        <div className="master-menu-entry">
          <a className="primary-link" href="/admin">Кабинет мастера</a>
          <small>Клиентам туда нельзя. Там скучно, пароли и ответственность.</small>
        </div>
      </nav>
    </header>
  );
}
