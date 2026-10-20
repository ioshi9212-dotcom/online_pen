"use client";

import { usePathname, useSearchParams } from "next/navigation";
import ClientSaveToast from "./ClientSaveToast";
import UiIcon from "./UiIcon";

export default function SiteHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname.startsWith("/admin")) return null;

  const clientToken = searchParams.get("client") || "";
  const profileHref = clientToken ? `/profile?client=${clientToken}` : "/login";
  const homeHref = clientToken ? `/my?client=${clientToken}` : "/";

  return (
    <>
      <ClientSaveToast />
      <header className="top-menu compact-client-menu beauty-top-card">
        <a className="brand beauty-brand" href={homeHref}>
          <span className="brand-icon beauty-brand-icon" aria-hidden="true"><UiIcon name="calendar" /></span>
          <b>Онлайн-запись</b>
        </a>

        <nav className="menu-links compact-client-links beauty-menu-links" aria-label="Основное меню">
          <a className="beauty-menu-row" href={profileHref}>
            <span className="beauty-menu-icon" aria-hidden="true"><UiIcon name="user" /></span>
            <span>Профиль</span>
            <span className="beauty-menu-arrow" aria-hidden="true">›</span>
          </a>
          {clientToken ? (
            <a className="beauty-menu-row" href="/logout">
              <span className="beauty-menu-icon" aria-hidden="true"><UiIcon name="logout" /></span>
              <span>Выйти</span>
              <span className="beauty-menu-arrow" aria-hidden="true">›</span>
            </a>
          ) : null}
          <div className="master-menu-entry beauty-master-entry">
            <a className="primary-link beauty-menu-row" href="/admin">
              <span className="beauty-menu-icon" aria-hidden="true"><UiIcon name="settings" /></span>
              <span>Мастеру</span>
              <span className="beauty-menu-arrow" aria-hidden="true">›</span>
            </a>
          </div>
        </nav>
      </header>
    </>
  );
}
