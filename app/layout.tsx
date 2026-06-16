import type { Metadata } from "next";
import type { ReactNode } from "react";
import ConfirmDangerActions from "./ConfirmDangerActions";
import "./globals.css";
import "./plain-interface.css";

export const metadata: Metadata = {
  title: "Онлайн-запись",
  description: "Онлайн-запись к мастеру"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <ConfirmDangerActions />
        <div className="app-shell">
          <header className="top-menu">
            <a className="brand" href="/">
              <span className="brand-icon">▣</span>
              <b>Онлайн-запись</b>
            </a>
            <nav className="menu-links" aria-label="Основное меню">
              <a href="/price">Прайс</a>
              <a href="/#how">Как записаться</a>
              <a href="/login">Войти</a>
              <a className="primary-link" href="/register">Выбрать время</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
