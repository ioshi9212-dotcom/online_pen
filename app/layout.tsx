import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Онлайн-запись",
  description: "Онлайн-запись к мастеру"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="site-frame">
          <div className="container">
            <header className="header">
              <a className="logo" href="/">Онлайн-запись</a>
              <nav className="nav" aria-label="Основное меню">
                <a href="/price">Прайс</a>
                <a href="/register">Регистрация</a>
                <a href="/login">Вход клиента</a>
                <a href="/admin" className="admin-nav-link">Админка</a>
              </nav>
            </header>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
