"use client";

import { usePathname, useSearchParams } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname.startsWith("/admin")) return null;

  const clientToken = searchParams.get("client") || "";
  const profileHref = clientToken ? `/profile?client=${clientToken}` : "/login";
  const homeHref = clientToken ? `/my?client=${clientToken}` : "/";

  return (
    <header className="top-menu compact-client-menu beauty-top-card">
      <a className="brand beauty-brand" href={homeHref}>
        <span className="brand-icon beauty-brand-icon" aria-hidden="true">▣</span>
        <b>Онлайн-запись</b>
      </a>

      <nav className="menu-links compact-client-links beauty-menu-links" aria-label="Основное меню">
        <a className="beauty-menu-row" href={profileHref}>
          <span className="beauty-menu-icon" aria-hidden="true">♡</span>
          <span>Профиль</span>
          <span className="beauty-menu-arrow" aria-hidden="true">›</span>
        </a>
        <div className="master-menu-entry beauty-master-entry">
          <a className="primary-link beauty-menu-row" href="/admin">
            <span className="beauty-menu-icon" aria-hidden="true">♕</span>
            <span>Кабинет мастера</span>
            <span className="beauty-menu-arrow" aria-hidden="true">›</span>
          </a>
          <small>Клиентам туда нельзя. Там скучно, пароли и ответственность.</small>
        </div>
      </nav>
    </header>
  );
}
